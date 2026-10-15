const JSZip = require('jszip');
const { sanitizeFilename } = require('./media-extractor');

/**
 * Builds and streams a ZIP archive directly to an HTTP response using JSZip
 * @param {Array} mediaItems List of media items to include
 * @param {string} profileName Display name or username for the ZIP archive
 * @param {import('express').Response} res Express response object
 */
async function streamZipArchive(mediaItems, profileName, res) {
  if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
    throw new Error('No media items to package into ZIP.');
  }

  const cleanName = sanitizeFilename(profileName || 'threads_media', 'threads_media');
  const zipFilename = `${cleanName}_media.zip`;

  // Encode for Content-Disposition header supporting UTF-8 and spaces
  const encodedFilename = encodeURIComponent(zipFilename);

  const zip = new JSZip();
  let addedCount = 0;

  // Concurrently fetch media files in batches of 5 to maximize throughput
  const BATCH_SIZE = 5;
  for (let i = 0; i < mediaItems.length; i += BATCH_SIZE) {
    const chunk = mediaItems.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async (item, idx) => {
      if (!item || !item.url) return;
      const fileIndex = i + idx + 1;
      const fileFilename = sanitizeFilename(item.filename || `media_${fileIndex}.bin`, `file_${fileIndex}`);

      try {
        const response = await fetch(item.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://www.threads.net/'
          }
        });

        if (!response.ok) {
          console.warn(`Failed to fetch media for ZIP: ${item.url} (Status: ${response.status})`);
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
    zip.file('README.txt', 'No media files could be downloaded from the provided profile.');
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${cleanName}_media.zip"; filename*=UTF-8''${encodedFilename}`);

  const nodeStream = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE' });
  nodeStream.pipe(res);

  return new Promise((resolve, reject) => {
    nodeStream.on('end', resolve);
    nodeStream.on('error', reject);
  });
}

module.exports = {
  streamZipArchive
};
