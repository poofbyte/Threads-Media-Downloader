const fs = require('fs');

for (const num of [10, 14, 22]) {
  try {
    const raw = fs.readFileSync(`script_${num}.json`, 'utf8');
    const data = JSON.parse(raw);
    console.log(`\n=== SCRIPT ${num} ===`);
    console.log('Top keys:', Object.keys(data));
    const str = JSON.stringify(data);
    console.log('Contains mediaData?', str.includes('mediaData'));
    console.log('Contains thread_items?', str.includes('thread_items'));
    console.log('Contains image_versions2?', str.includes('image_versions2'));
    console.log('Contains video_versions?', str.includes('video_versions'));
    console.log('Contains carousel_media?', str.includes('carousel_media'));
    console.log('Contains user?', str.includes('"user":'));
    console.log('Contains xdt_api?', str.includes('xdt_api'));
  } catch (err) {
    console.error(`Error script ${num}:`, err.message);
  }
}
