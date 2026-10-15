const puppeteer = require('puppeteer-core');
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

async function testFullCollection() {
  console.log('Testing full collection for @mandiir___ without cookies...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  let collectedMedia = [];
  const discoveredPosts = new Set();

  for (const tab of ['', '/media', '/replies']) {
    const url = `https://www.threads.net/@mandiir___${tab}`;
    console.log(`\nVisiting: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Dismiss dialog
    await page.evaluate(() => {
      document.querySelectorAll('[role="dialog"]').forEach(d => {
        let p = d.parentElement;
        while (p && p !== document.body) {
          if (window.getComputedStyle(p).position === 'fixed') { p.remove(); break; }
          p = p.parentElement;
        }
        d.remove();
      });
    });

    // Extract scripts
    const scripts = await page.evaluate(() => {
      const sArr = [];
      document.querySelectorAll('script[type="application/json"]').forEach(s => {
        const txt = s.textContent;
        if (txt && (txt.includes('thread_items') || txt.includes('mediaData') || txt.includes('carousel_media'))) {
          sArr.push(txt);
        }
      });
      return sArr;
    });

    console.log(`Scripts found on ${tab || 'feed'}: ${scripts.length}`);
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s);
        const allThreadItems = findAllInObject(parsed, 'thread_items', 40);
        for (const items of allThreadItems) {
          if (Array.isArray(items)) {
            for (const ti of items) {
              if (ti && ti.post) {
                if (ti.post.code) discoveredPosts.add(ti.post.code);
                const extracted = extractMediaFromPost(ti.post, 'mandiir___');
                collectedMedia.push(...extracted);
              }
            }
          }
        }
      } catch (e) {}
    }

    // Also get DOM post links
    const domLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/post/"]')).map(a => {
        const m = a.href.match(/\/@[^/]+\/post\/([^/?#]+)/);
        return m ? m[1] : null;
      }).filter(Boolean);
    });
    domLinks.forEach(code => discoveredPosts.add(code));

    // Also extract DOM images directly
    const domImages = await page.evaluate(() => {
      const imgs = [];
      document.querySelectorAll('img').forEach(img => {
        if (img.src && !img.src.includes('avatar') && !img.src.includes('profile') && (img.naturalWidth > 150 || img.width > 150)) {
          imgs.push({
            type: 'image',
            url: img.src,
            previewUrl: img.src,
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            resolution: `${img.naturalWidth || img.width}x${img.naturalHeight || img.height}`
          });
        }
      });
      return imgs;
    });

    domImages.forEach((item, idx) => {
      collectedMedia.push({
        id: `dom_${tab}_${idx}_${item.url.slice(-25)}`,
        postId: 'dom',
        code: '',
        type: 'image',
        url: item.url,
        previewUrl: item.url,
        width: item.width,
        height: item.height,
        resolution: item.resolution,
        caption: '',
        takenAt: null,
        username: 'mandiir___',
        isCarousel: false,
        filename: `mandiir____media_${idx + 1}.jpg`
      });
    });

    collectedMedia = deduplicateMedia(collectedMedia);
    console.log(`Current unique media after ${tab || 'feed'}: ${collectedMedia.length}`);
  }

  console.log(`\nDiscovered post codes:`, Array.from(discoveredPosts));
  console.log(`Total unique media files: ${collectedMedia.length}`);

  // Unpack any post codes that need full inspection
  for (const code of discoveredPosts) {
    console.log(`Checking post ${code} for full carousels...`);
    await page.goto(`https://www.threads.net/@mandiir___/post/${code}`, { waitUntil: 'networkidle2' });
    const postScripts = await page.evaluate(() => {
      const sArr = [];
      document.querySelectorAll('script[type="application/json"]').forEach(s => {
        const txt = s.textContent;
        if (txt && (txt.includes('thread_items') || txt.includes('carousel_media'))) {
          sArr.push(txt);
        }
      });
      return sArr;
    });

    for (const s of postScripts) {
      try {
        const parsed = JSON.parse(s);
        const allThreadItems = findAllInObject(parsed, 'thread_items', 40);
        for (const items of allThreadItems) {
          if (Array.isArray(items)) {
            for (const ti of items) {
              if (ti && ti.post) {
                const extracted = extractMediaFromPost(ti.post, 'mandiir___');
                collectedMedia.push(...extracted);
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  collectedMedia = deduplicateMedia(collectedMedia);
  console.log(`\nFinal unique media collected: ${collectedMedia.length}`);
  console.log(`Images: ${collectedMedia.filter(m => m.type === 'image').length}, Videos: ${collectedMedia.filter(m => m.type === 'video').length}`);

  await browser.close();
}

testFullCollection();
