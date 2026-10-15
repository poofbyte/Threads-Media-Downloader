const fs = require('fs');
const { extractMediaFromPost, deduplicateMedia } = require('../lib/media-extractor');

function findAllInObject(obj, targetKey, maxDepth = 40, currentDepth = 0, results = []) {
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

const raw = fs.readFileSync('test-scripts/script_22.json', 'utf8');
const parsed = JSON.parse(raw);

const allThreadItems = findAllInObject(parsed, 'thread_items', 40);
console.log('Total thread_items arrays found with depth 40:', allThreadItems.length);

let totalMedia = [];
allThreadItems.forEach(items => {
  if (Array.isArray(items)) {
    items.forEach(ti => {
      if (ti.post) {
        const extracted = extractMediaFromPost(ti.post, 'zuck');
        totalMedia.push(...extracted);
      }
    });
  }
});

totalMedia = deduplicateMedia(totalMedia);
console.log(`Total unique media extracted via thread_items search: ${totalMedia.length}`);
console.log(`Images: ${totalMedia.filter(m => m.type === 'image').length}, Videos: ${totalMedia.filter(m => m.type === 'video').length}, Carousels: ${totalMedia.filter(m => m.isCarousel).length}`);
