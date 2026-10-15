const puppeteer = require('puppeteer-core');

async function testSinglePost() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  console.log('Navigating to post page: https://www.threads.net/@zuck/post/DeZtp-TkQHh');
  await page.goto('https://www.threads.net/@zuck/post/DeZtp-TkQHh', { waitUntil: 'networkidle2' });

  const result = await page.evaluate(() => {
    const scripts = [];
    document.querySelectorAll('script[type="application/json"]').forEach(s => {
      const txt = s.textContent;
      if (txt.includes('image_versions2') || txt.includes('video_versions') || txt.includes('thread_items')) {
        scripts.push(txt.length);
      }
    });
    const imgs = Array.from(document.querySelectorAll('img')).map(i => i.src).filter(s => !s.includes('avatar') && !s.includes('profile'));
    return { scriptsFound: scripts, imagesFound: imgs.length };
  });

  console.log('Post page inspection:', result);
  await browser.close();
}

testSinglePost();
