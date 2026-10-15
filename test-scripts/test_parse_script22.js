const fs = require('fs');

const raw = fs.readFileSync('script_22.json', 'utf8');
const data = JSON.parse(raw);

// Find where mediaData or thread_items is in data
function findInObject(obj, targetKey, path = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    const currentPath = path ? `${path}.${k}` : k;
    if (k === targetKey) {
      console.log(`Found ${targetKey} at: ${currentPath}`);
      return obj[k];
    }
    const res = findInObject(obj[k], targetKey, currentPath);
    if (res) return res;
  }
}

const mediaData = findInObject(data, 'mediaData');
if (mediaData) {
  console.log('mediaData keys:', Object.keys(mediaData));
  if (mediaData.edges) {
    console.log('edges count:', mediaData.edges.length);
    console.log('page_info:', mediaData.page_info);
  }
}

const threadItems = findInObject(data, 'thread_items');
if (threadItems) {
  console.log('Found thread items, length:', threadItems.length);
}
