const puppeteer = require('puppeteer-core');

async function testNetwork() {
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
  const urls = [];
  page.on('response', (res) => {
    const u = res.url();
    if (!u.endsWith('.js') && !u.endsWith('.css') && !u.endsWith('.png') && !u.includes('static.xx.fbcdn.net')) {
      urls.push({ url: u.slice(0, 100), status: res.status() });
    }
  });

  await page.goto('https://www.threads.net/@zuck', { waitUntil: 'networkidle2' });
  console.log('Initial non-asset URLs:', urls.length);

  // Scroll 3 times
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('Total non-asset URLs:', urls.length);
  urls.forEach(item => console.log(item.status, item.url));

  // Also check what DOM media is visible on the page
  const domMedia = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      alt: img.alt
    })).filter(x => x.src && !x.src.includes('avatar') && !x.src.includes('profile') && x.width > 150);

    const videos = Array.from(document.querySelectorAll('video')).map(v => ({
      src: v.src || (v.querySelector('source') ? v.querySelector('source').src : ''),
      currentSrc: v.currentSrc,
      poster: v.poster
    }));

    return { imagesCount: images.length, videosCount: videos.length, images: images.slice(0, 5), videos: videos.slice(0, 3) };
  });

  console.log('\nDOM Media found:', domMedia);

  await browser.close();
}

testNetwork();
