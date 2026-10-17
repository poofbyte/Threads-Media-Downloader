const express = require('express');
const path = require('path');
const fs = require('fs');
const { ThreadsScraper, normalizeProfileInput } = require('./lib/scraper');
const { sanitizeFilename } = require('./lib/media-extractor');
const { streamZipArchive } = require('./lib/zip-builder');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Active scan sessions map
const activeSessions = new Map();

// In-memory cache for completed scans: sessionId / username -> { username, media, createdAt }
const completedScans = new Map();

// Periodically prune scans older than 2 hours to avoid memory growth
setInterval(() => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const [key, val] of completedScans.entries()) {
    if (val.createdAt < twoHoursAgo) completedScans.delete(key);
  }
}, 30 * 60 * 1000).unref();

/**
 * Health & diagnostic check
 */
app.get('/api/health', (req, res) => {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeAvailable = fs.existsSync(chromePath);
  res.json({
    status: 'ok',
    chromePath,
    chromeAvailable,
    timestamp: new Date().toISOString()
  });
});

/**
 * Server-Sent Events (SSE) endpoint for real-time profile scanning
 */
app.get('/api/scan', async (req, res) => {
  const profileInput = req.query.profile;
  const sessionId = req.query.sessionId || `session_${Date.now()}`;
  // User provided cookies via query or header (local-only, not logged)
  const userCookies = req.headers['x-threads-cookies'] || req.query.cookies || null;

  if (!profileInput) {
    return res.status(400).json({ error: 'Missing "profile" parameter' });
  }

  const normalized = normalizeProfileInput(profileInput);
  if (!normalized) {
    return res.status(400).json({ error: 'Invalid profile URL or username' });
  }

  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (eventType, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const scraper = new ThreadsScraper();
  activeSessions.set(sessionId, scraper);

  req.on('close', () => {
    scraper.cancel();
    activeSessions.delete(sessionId);
  });

  try {
    sendEvent('status', {
      stage: 'init',
      message: `Starting scan for @${normalized.username}...`
    });

    const scanResult = await scraper.scrape(profileInput, userCookies, (event) => {
      sendEvent(event.type, event);
    });

    if (scanResult && Array.isArray(scanResult.media) && scanResult.media.length > 0) {
      const scanEntry = {
        username: scanResult.username || normalized.username,
        media: scanResult.media,
        createdAt: Date.now()
      };
      completedScans.set(sessionId, scanEntry);
      completedScans.set(normalized.username.toLowerCase(), scanEntry);
    }

    activeSessions.delete(sessionId);
    res.end();
  } catch (err) {
    console.error('Scan error:', err.message);
    sendEvent('error', {
      message: err.message || 'An error occurred during scanning. Threads may have restricted access.'
    });
    activeSessions.delete(sessionId);
    res.end();
  }
});

/**
 * Stop an ongoing scan session
 */
app.post('/api/scan/stop', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && activeSessions.has(sessionId)) {
    const scraper = activeSessions.get(sessionId);
    scraper.cancel();
    activeSessions.delete(sessionId);
    return res.json({ success: true, message: 'Scan cancelled.' });
  }
  res.json({ success: false, message: 'Session not found or already completed.' });
});

/**
 * Proxy download for a single media file (bypasses CDN CORS, sets proper filename)
 */
app.get('/api/download-single', async (req, res) => {
  const fileUrl = req.query.url;
  const rawFilename = req.query.filename || 'threads_media.bin';

  if (!fileUrl) {
    return res.status(400).send('Missing "url" parameter');
  }

  try {
    const cleanFilename = sanitizeFilename(rawFilename, 'threads_media');
    const encodedFilename = encodeURIComponent(cleanFilename);

    const upstreamRes = await fetch(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.threads.net/'
      }
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send(`Failed to fetch file from source (Status: ${upstreamRes.status})`);
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstreamRes.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"; filename*=UTF-8''${encodedFilename}`);

    const buffer = await upstreamRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Single download error:', err.message);
    res.status(500).send('Download failed: ' + err.message);
  }
});

/**
 * Local Image Proxy: Allows browser to reliably load avatars and thumbnails
 * without CORS, referrer policy blocks, or browser tracking protection interference.
 */
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const upstreamRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.threads.net/'
      }
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send(`Upstream returned ${upstreamRes.status}`);
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buffer = await upstreamRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send('Image proxy failed: ' + err.message);
  }
});

/**
 * Download all or selected media as a ZIP archive
 * Supports:
 * 1. GET /api/download-zip?sessionId=... or ?username=... (Direct browser download, 0 payload!)
 * 2. POST /api/download-zip (JSON payload with sessionId or items)
 */
const handleZipDownload = async (req, res) => {
  const sessionId = req.query.sessionId || req.body?.sessionId;
  const usernameParam = req.query.username || req.query.profile || req.body?.profileName;
  let items = req.body?.items;
  let username = usernameParam;

  // 1. Try resolving from server memory cache
  if (sessionId && completedScans.has(sessionId)) {
    const cached = completedScans.get(sessionId);
    items = cached.media;
    username = cached.username || username;
  } else if (username && completedScans.has(username.toLowerCase())) {
    const cached = completedScans.get(username.toLowerCase());
    items = cached.media;
    username = cached.username || username;
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).send('No media items available for ZIP packaging. Please re-scan the profile.');
  }

  // Filter to only items with URLs, keeping it lightweight
  const validItems = items
    .filter(it => it && it.url)
    .map((it, idx) => ({
      url: it.url,
      filename: it.filename || `${username || 'media'}_${idx + 1}.jpg`
    }));

  if (validItems.length === 0) {
    return res.status(400).send('No downloadable media URLs found.');
  }

  console.log(`[ZIP API] Packaging request for @${username || 'user'} (${validItems.length} items)...`);

  try {
    await streamZipArchive(validItems, username, res);
  } catch (err) {
    console.error('ZIP download error:', err.message);
    if (!res.headersSent) {
      res.status(500).send('ZIP packaging failed: ' + err.message);
    }
  }
};

app.get('/api/download-zip', handleZipDownload);
app.post('/api/download-zip', handleZipDownload);

// Clean error handler for malformed JSON or body-parser errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.warn('Bad JSON request received from client:', err.message);
    return res.status(400).json({ error: 'Malformed request payload' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Threads Media Downloader Web App Running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
