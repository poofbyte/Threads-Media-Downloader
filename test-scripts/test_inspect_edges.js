const fs = require('fs');

const raw = fs.readFileSync('script_22.json', 'utf8');
const data = JSON.parse(raw);

function findInObject(obj, targetKey) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    if (k === targetKey) return obj[k];
    const res = findInObject(obj[k], targetKey);
    if (res) return res;
  }
}

const mediaData = findInObject(data, 'mediaData');
console.log('Total edges in initial script:', mediaData.edges.length);

mediaData.edges.forEach((edge, i) => {
  const items = edge.node?.thread_items || [];
  console.log(`\n--- Edge ${i + 1} (${items.length} thread items) ---`);
  items.forEach((item, j) => {
    const post = item.post;
    if (!post) return;
    console.log(`  Post PK: ${post.pk}, Code: ${post.code}`);
    console.log(`  User: ${post.user?.username} (${post.user?.full_name})`);
    console.log(`  Caption: ${post.caption?.text?.slice(0, 50)}...`);
    console.log(`  Media type: ${post.media_type}`);
    if (post.carousel_media) {
      console.log(`  Carousel items: ${post.carousel_media.length}`);
      post.carousel_media.forEach((c, idx) => {
        const topImg = c.image_versions2?.candidates?.[0];
        const topVid = c.video_versions?.[0];
        console.log(`    Carousel #${idx + 1}: ${topVid ? 'VIDEO ' + topVid.width + 'x' + topVid.height : 'IMG ' + topImg?.width + 'x' + topImg?.height}`);
      });
    } else {
      const topImg = post.image_versions2?.candidates?.[0];
      const topVid = post.video_versions?.[0];
      if (topVid) {
        console.log(`  Video: ${topVid.width}x${topVid.height} url: ${topVid.url.slice(0, 80)}...`);
      }
      if (topImg) {
        console.log(`  Image: ${topImg.width}x${topImg.height} url: ${topImg.url.slice(0, 80)}...`);
      }
    }
  });
});
