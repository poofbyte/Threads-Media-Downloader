const puppeteer = require('puppeteer-core');

async function testMediaTab() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('https://www.threads.net/@zuck/media', { waitUntil: 'networkidle2' });

  // Dismiss barrier dialog if present
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"]').forEach(d => {
      let p = d.parentElement;
      while (p && p !== document.body) {
        if (getComputedStyle(p).position === 'fixed') { p.remove(); break; }
        p = p.parentElement;
      }
      d.remove();
    });
  });

  const result = await page.evaluate(() => {
    const sv = document.getElementById('scrollview') || document.querySelector('div[style*="overflow-y"]');
    const images = Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height
    })).filter(x => x.src && !x.src.includes('avatar') && !x.src.includes('profile') && x.width > 150);

    const videos = Array.from(document.querySelectorAll('video')).map(v => ({
      src: v.src || (v.querySelector('source') ? v.querySelector('source').src : ''),
      currentSrc: v.currentSrc
    }));

    return {
      title: document.title,
      scrollHeight: sv ? sv.scrollHeight : 0,
      imagesCount: images.length,
      videosCount: videos.length,
      images: images.slice(0, 5),
      videos: videos.slice(0, 3)
    };
  });

  console.log('Media tab result:', result);
  await browser.close();
}

testMediaTab();
