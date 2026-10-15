const JSZip = require('jszip');
const { sanitizeFilename } = require('./media-extractor');

/**
 * Builds and sends a ZIP archive directly to an HTTP response using JSZip
 * @param {Array} mediaItems List of media items to include
 * @param {string} profileName Username for the ZIP archive
 * @param {import('express').Response} res Express response object
 */
async function streamZipArchive(mediaItems, profileName, res) {
  if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
    throw new Error('No media items to package into ZIP.');
  }

  // Pure username without '_media' suffix
  const cleanName = sanitizeFilename(profileName || 'threads_user', 'threads_user');
  const zipFilename = `${cleanName}.zip`;
  const encodedFilename = encodeURIComponent(zipFilename);

  const zip = new JSZip();
  let addedCount = 0;
  const seenFilenames = new Set();

  // Concurrently fetch media files in batches of 6 with individual 15s timeouts
  const BATCH_SIZE = 6;
  for (let i = 0; i < mediaItems.length; i += BATCH_SIZE) {
    const chunk = mediaItems.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async (item, idx) => {
      if (!item || !item.url) return;
      const fileIndex = i + idx + 1;
      
      let fileFilename = sanitizeFilename(item.filename || `media_${fileIndex}.jpg`, `file_${fileIndex}`);
      if (seenFilenames.has(fileFilename)) {
        const dotIdx = fileFilename.lastIndexOf('.');
        if (dotIdx !== -1) {
          fileFilename = `${fileFilename.slice(0, dotIdx)}_${fileIndex}${fileFilename.slice(dotIdx)}`;
        } else {
          fileFilename = `${fileFilename}_${fileIndex}`;
        }
      }
      seenFilenames.add(fileFilename);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000);

        const response = await fetch(item.url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://www.threads.net/'
          }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`Failed to fetch media for ZIP: ${item.url.slice(0, 60)} (Status: ${response.status})`);
          return;
        }

        const buffer = await response.arrayBuffer();
        zip.file(fileFilename, Buffer.from(buffer));
        addedCount++;
      } catch (err) {
        console.warn(`Error fetching file [${fileFilename}] for ZIP:`, err.message);
      }
    }));
  }

  if (addedCount === 0) {
    zip.file('README.txt', `No media files could be downloaded for @${cleanName}.`);
  }

  // Generate robust zip buffer (avoids Node stream piping bugs and provides exact Content-Length)
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', zipBuffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"; filename*=UTF-8''${encodedFilename}`);

  res.send(zipBuffer);
}

module.exports = {
  streamZipArchive
};

