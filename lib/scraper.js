const puppeteer = require('puppeteer-core');
const { extractMediaFromPost, deduplicateMedia, sanitizeFilename, inferExtension } = require('./media-extractor');

// Default Chrome executable path on Windows
const DEFAULT_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/**
 * Clean and normalize user input into a Threads username and URL
 */
function normalizeProfileInput(input) {
  if (!input || typeof input !== 'string') return null;
  let str = input.trim();
  
  // Strip leading @
  if (str.startsWith('@')) {
    str = str.slice(1);
  }

  // Check if it's a URL
  try {
    if (str.startsWith('http://') || str.startsWith('https://')) {
      const u = new URL(str);
      const match = u.pathname.match(/@([^/?#]+)/);
      if (match) {
        return {
          username: match[1],
          profileUrl: `https://www.threads.net/@${match[1]}`,
          mediaUrl: `https://www.threads.net/@${match[1]}/media`
        };
      }
    }
  } catch (e) {}

  // Pure username
  const cleanUsername = str.replace(/[^a-zA-Z0-9._]/g, '');
  if (!cleanUsername) return null;

  return {
    username: cleanUsername,
    profileUrl: `https://www.threads.net/@${cleanUsername}`,
    mediaUrl: `https://www.threads.net/@${cleanUsername}/media`
  };
}

/**
 * Parse user-provided cookies from either string or JSON format
 */
function parseCookies(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return [];
  const trimmed = rawInput.trim();
  if (!trimmed) return [];

  const cookies = [];

  // Try parsing as JSON array first (e.g. from Cookie-Editor / EditThisCookie)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.name && item.value) {
            cookies.push({
              name: String(item.name).trim(),
              value: String(item.value).trim(),
              domain: item.domain || '.threads.net',
              path: item.path || '/'
            });
          }
        }
        if (cookies.length > 0) return cookies;
      }
    } catch (e) {}
  }

  // Parse standard header format: "key1=value1; key2=value2"
  const pairs = trimmed.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (key && val) {
        cookies.push({
          name: key,
          value: val,
          domain: '.threads.net',
          path: '/'
        });
      }
    }
  }

  return cookies;
}

/**
 * Deep search in an object for matching keys
 */
function findInObject(obj, targetKey, maxDepth = 15, currentDepth = 0) {
  if (!obj || typeof obj !== 'object' || currentDepth > maxDepth) return null;
  if (Object.prototype.hasOwnProperty.call(obj, targetKey)) {
    return obj[targetKey];
  }
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    if (val && typeof val === 'object') {
      const found = findInObject(val, targetKey, maxDepth, currentDepth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find all occurrences of targetKey in an object
 */
function findAllInObject(obj, targetKey, maxDepth = 15, currentDepth = 0, results = []) {
  if (!obj || typeof obj !== 'object' || currentDepth > maxDepth) return results;
  if (Object.prototype.hasOwnProperty.call(obj, targetKey)) {
    results.push(obj[targetKey]);
  }
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    if (val && typeof val === 'object') {
      findAllInObject(val, targetKey, maxDepth, currentDepth + 1, results);
    }
  }
  return results;
}

/**
 * Intelligent Threads Scraper Engine
 */
class ThreadsScraper {
  constructor(options = {}) {
    this.chromePath = options.chromePath || DEFAULT_CHROME_PATH;
    this.browser = null;
    this.isCancelled = false;
  }

  cancel() {
    this.isCancelled = true;
  }

  async scrape(input, cookiesRaw = null, onProgress = () => {}) {
    this.isCancelled = false;
    const normalized = normalizeProfileInput(input);
    if (!normalized) {
      throw new Error('Invalid Threads profile or username. Please enter a valid @username or Threads URL.');
    }

    const { username, profileUrl, mediaUrl } = normalized;
    onProgress({ type: 'status', message: `Initializing scanner for @${username}...`, stage: 'init' });

    let collectedMedia = [];
    let profileData = {
      username,
      displayName: username,
      avatarUrl: null,
      bio: null,
      verified: false
    };

    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        executablePath: this.chromePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1280,900',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ],
        defaultViewport: { width: 1280, height: 900 }
      });

      const page = await this.browser.newPage();

      // Configure cookies if provided
      const parsedCookies = parseCookies(cookiesRaw);
      if (parsedCookies.length > 0) {
        onProgress({ type: 'status', message: `Applying ${parsedCookies.length} session cookies for authenticated scanning...`, stage: 'auth' });
        try {
          await page.setCookie(...parsedCookies);
          // Also set for .threads.com
          const threadsComCookies = parsedCookies.map(c => ({ ...c, domain: '.threads.com' }));
          await page.setCookie(...threadsComCookies);
        } catch (cookieErr) {
          console.warn('Cookie application warning:', cookieErr.message);
        }
      }

      // Network Interceptor: capture any GraphQL or direct API responses during navigation/scrolling
      page.on('response', async (response) => {
        if (this.isCancelled) return;
        const url = response.url();
        if (url.includes('/api/graphql') || url.includes('/graphql/query')) {
          try {
            const json = await response.json();
            const mediaEdges = findAllInObject(json, 'mediaData') || [];
            for (const md of mediaEdges) {
              if (md && Array.isArray(md.edges)) {
                for (const edge of md.edges) {
                  const items = edge.node?.thread_items || [];
                  for (const ti of items) {
                    if (ti.post) {
                      const extracted = extractMediaFromPost(ti.post, username);
                      if (extracted.length > 0) {
                        collectedMedia.push(...extracted);
                        collectedMedia = deduplicateMedia(collectedMedia);
                        onProgress({
                          type: 'media_batch',
                          items: extracted,
                          totalCount: collectedMedia.length,
                          message: `Discovered ${collectedMedia.length} high-res media files...`
                        });
                      }
                    }
                  }
                }
              }
            }
          } catch (e) {}
        }
      });

      // 1. Navigate to main profile page
      onProgress({ type: 'status', message: `Opening profile page for @${username}...`, stage: 'loading_profile' });
      await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 35000 });

      // Dismiss login barriers / dialogs
      await page.evaluate(() => {
        document.querySelectorAll('[role="dialog"]').forEach(d => {
          let p = d.parentElement;
          while (p && p !== document.body) {
            if (window.getComputedStyle(p).position === 'fixed') { p.remove(); break; }
            p = p.parentElement;
          }
          d.remove();
        });
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
      });

      // Extract initial embedded profile metadata & script JSON
      const initialData = await page.evaluate(() => {
        // Find user display name
        const h1 = document.querySelector('h1');
        const displayName = h1 ? h1.innerText.trim() : null;

        // Find avatar from DOM with expanded selector
        let avatarUrl = null;
        const avatarImg = document.querySelector('img[alt*="profile picture"], img[alt*="Profile picture"], header img');
        if (avatarImg && avatarImg.src && !avatarImg.src.startsWith('data:')) {
          avatarUrl = avatarImg.src;
        }

        // Collect all embedded JSON scripts
        const jsonScripts = [];
        document.querySelectorAll('script[type="application/json"]').forEach(s => {
          try {
            const txt = s.textContent;
            if (txt) {
              // Extract avatar if not found yet
              if (!avatarUrl) {
                const picMatch = txt.match(/"profile_pic_url":\s*"([^"]+)"/) || txt.match(/"profile_pic_url_hd":\s*"([^"]+)"/);
                if (picMatch) {
                  avatarUrl = picMatch[1].replace(/\\/g, '');
                }
              }
              if (txt.includes('mediaData') || txt.includes('thread_items') || txt.includes('image_versions2')) {
                jsonScripts.push(txt);
              }
            }
          } catch (e) {}
        });

        return { displayName, avatarUrl, bio, jsonScripts };
      });

      if (initialData.displayName) profileData.displayName = initialData.displayName;
      if (initialData.avatarUrl) profileData.avatarUrl = initialData.avatarUrl;
      if (initialData.bio) profileData.bio = initialData.bio;

      onProgress({
        type: 'profile_info',
        profile: profileData,
        message: `Connected to @${username} (${profileData.displayName})`
      });

      // Parse JSON from initial embedded scripts
      for (const scriptTxt of initialData.jsonScripts || []) {
        try {
          const parsed = JSON.parse(scriptTxt);
          const allMediaData = findAllInObject(parsed, 'mediaData');
          for (const md of allMediaData) {
            if (md && Array.isArray(md.edges)) {
              for (const edge of md.edges) {
                const items = edge.node?.thread_items || [];
                for (const ti of items) {
                  if (ti.post) {
                    const extracted = extractMediaFromPost(ti.post, username);
                    collectedMedia.push(...extracted);
                  }
                }
              }
            }
          }
        } catch (e) {}
      }

      collectedMedia = deduplicateMedia(collectedMedia);
      if (collectedMedia.length > 0) {
        onProgress({
          type: 'media_batch',
          items: collectedMedia,
          totalCount: collectedMedia.length,
          message: `Extracted ${collectedMedia.length} media files from initial profile feed...`
        });
      }

      // 2. Also visit /media tab for comprehensive media collection
      if (!this.isCancelled) {
        onProgress({ type: 'status', message: `Scanning media tab (@${username}/media)...`, stage: 'media_tab' });
        try {
          await page.goto(mediaUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          
          // Dismiss dialogs on media tab
          await page.evaluate(() => {
            document.querySelectorAll('[role="dialog"]').forEach(d => {
              let p = d.parentElement;
              while (p && p !== document.body) {
                if (window.getComputedStyle(p).position === 'fixed') { p.remove(); break; }
                p = p.parentElement;
              }
              d.remove();
            });
            document.body.style.overflow = 'auto';
            document.documentElement.style.overflow = 'auto';
          });

          // Extract embedded scripts on media tab as well
          const mediaTabScripts = await page.evaluate(() => {
            const scripts = [];
            document.querySelectorAll('script[type="application/json"]').forEach(s => {
              try {
                const txt = s.textContent;
                if (txt && (txt.includes('mediaData') || txt.includes('thread_items') || txt.includes('image_versions2'))) {
                  scripts.push(txt);
                }
              } catch (e) {}
            });
            return scripts;
          });

          for (const scriptTxt of mediaTabScripts) {
            try {
              const parsed = JSON.parse(scriptTxt);
              const allMediaData = findAllInObject(parsed, 'mediaData');
              for (const md of allMediaData) {
                if (md && Array.isArray(md.edges)) {
                  for (const edge of md.edges) {
                    const items = edge.node?.thread_items || [];
                    for (const ti of items) {
                      if (ti.post) {
                        const extracted = extractMediaFromPost(ti.post, username);
                        collectedMedia.push(...extracted);
                      }
                    }
                  }
                }
              }
            } catch (e) {}
          }
          collectedMedia = deduplicateMedia(collectedMedia);
          onProgress({
            type: 'media_batch',
            items: collectedMedia,
            totalCount: collectedMedia.length,
            message: `Current collection: ${collectedMedia.length} high-res media files...`
          });
        } catch (mediaTabErr) {
          console.warn('Media tab scan notice:', mediaTabErr.message);
        }
      }

      // 3. Scroll through the profile to collect lazily loaded posts
      onProgress({ type: 'status', message: `Scrolling profile to load all posts...`, stage: 'scrolling' });

      const maxScrollRounds = 35;
      let lastMediaCount = collectedMedia.length;
      let stagnantCount = 0;

      for (let round = 1; round <= maxScrollRounds; round++) {
        if (this.isCancelled) {
          onProgress({ type: 'status', message: 'Scan stopped by user. Preserving collected media...', stage: 'stopped' });
          break;
        }

        // Scroll the active scrollable container
        const scrollStatus = await page.evaluate(() => {
          const sv = document.getElementById('scrollview') ||
                     document.querySelector('[data-scrollview="true"]') ||
                     document.querySelector('div[style*="overflow-y"]');
          if (sv) {
            sv.scrollTop += 1400;
            return { scrollTop: sv.scrollTop, scrollHeight: sv.scrollHeight, clientHeight: sv.clientHeight };
          }
          window.scrollBy(0, 1400);
          return { scrollTop: window.scrollY, scrollHeight: document.body.scrollHeight, clientHeight: window.innerHeight };
        });

        // Wait for dynamic network activity and DOM rendering
        await new Promise(r => setTimeout(r, 1600));

        // Extract any DOM media elements rendered in the view
        const domMedia = await page.evaluate((uname) => {
          const extracted = [];
          
          // Helper to get largest image from srcset
          const getLargestFromSrcset = (srcset) => {
            if (!srcset) return null;
            const parts = srcset.split(',').map(p => {
              const [url, descriptor] = p.trim().split(/\s+/);
              const width = descriptor && descriptor.endsWith('w') ? parseInt(descriptor, 10) : 0;
              return { url, width };
            }).filter(x => x.url);
            if (!parts.length) return null;
            parts.sort((a, b) => b.width - a.width);
            return parts[0].url;
          };

          // Find post containers
          const postLinks = document.querySelectorAll('a[href*="/post/"]');
          postLinks.forEach(link => {
            const container = link.closest('[data-pressable-container="true"]') || link.parentElement?.parentElement;
            if (!container) return;
            
            const match = link.href.match(/\/@[^/]+\/post\/([^/?#]+)/);
            const code = match ? match[1] : '';

            // Images in container
            container.querySelectorAll('img').forEach(img => {
              if (img.src && !img.src.includes('avatar') && !img.src.includes('profile') && (img.naturalWidth > 150 || img.width > 150)) {
                const bestUrl = getLargestFromSrcset(img.srcset) || img.src;
                extracted.push({
                  type: 'image',
                  code,
                  url: bestUrl,
                  previewUrl: img.src,
                  width: img.naturalWidth || img.width || null,
                  height: img.naturalHeight || img.height || null
                });
              }
            });

            // Videos in container
            container.querySelectorAll('video').forEach(video => {
              const src = video.currentSrc || video.src || (video.querySelector('source') ? video.querySelector('source').src : '');
              if (src && !src.startsWith('blob:')) {
                extracted.push({
                  type: 'video',
                  code,
                  url: src,
                  previewUrl: video.poster || null,
                  width: video.videoWidth || null,
                  height: video.videoHeight || null
                });
              }
            });
          });

          return extracted;
        }, username);

        if (domMedia && domMedia.length > 0) {
          for (const item of domMedia) {
            const ext = inferExtension(item.url, item.type);
            const filename = sanitizeFilename(`${username}_${item.code || 'post'}_${item.type}_${Date.now()}.${ext}`);
            collectedMedia.push({
              id: `dom_${item.code || 'item'}_${item.type}_${item.url.slice(-20)}`,
              postId: item.code || 'post',
              code: item.code,
              postUrl: item.code ? `https://www.threads.net/@${username}/post/${item.code}` : null,
              type: item.type,
              url: item.url,
              previewUrl: item.previewUrl || item.url,
              width: item.width,
              height: item.height,
              resolution: item.width && item.height ? `${item.width}x${item.height}` : (item.type === 'video' ? 'HD Video' : 'Original'),
              caption: '',
              takenAt: null,
              username,
              isCarousel: false,
              filename
            });
          }
          collectedMedia = deduplicateMedia(collectedMedia);
        }

        onProgress({
          type: 'scroll_progress',
          round,
          maxRounds: maxScrollRounds,
          totalCount: collectedMedia.length,
          message: `Scroll #${round}: ${collectedMedia.length} media items discovered...`
        });

        // Check stagnation
        if (collectedMedia.length === lastMediaCount) {
          stagnantCount++;
          if (stagnantCount >= 5) {
            onProgress({ type: 'status', message: 'Reached the end of available profile posts.', stage: 'bottom' });
            break;
          }
        } else {
          stagnantCount = 0;
          lastMediaCount = collectedMedia.length;
        }
      }

      await this.browser.close();
      this.browser = null;

      // Final summary
      const imagesCount = collectedMedia.filter(m => m.type === 'image').length;
      const videosCount = collectedMedia.filter(m => m.type === 'video').length;
      const carouselsCount = collectedMedia.filter(m => m.isCarousel).length;

      const summary = {
        totalMedia: collectedMedia.length,
        imagesCount,
        videosCount,
        carouselsCount
      };

      onProgress({
        type: 'complete',
        profile: profileData,
        summary,
        totalCount: collectedMedia.length,
        message: `Scan complete! Collected ${collectedMedia.length} high-res media files (${imagesCount} images, ${videosCount} videos).`
      });

      return {
        username,
        profile: profileData,
        summary,
        media: collectedMedia
      };

    } catch (err) {
      if (this.browser) {
        try { await this.browser.close(); } catch (e) {}
        this.browser = null;
      }
      throw err;
    }
  }
}

module.exports = {
  ThreadsScraper,
  normalizeProfileInput,
  parseCookies
};
