const puppeteer = require('puppeteer-core');

async function checkMandiir() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  
  for (const tab of ['', '/media', '/replies']) {
    const url = `https://www.threads.net/@mandiir___${tab}`;
    console.log(`\nNavigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // Check links and media
    const data = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/post/"]')).map(a => a.href);
      const uniqueLinks = [...new Set(links)];
      const imgs = Array.from(document.querySelectorAll('img')).map(i => i.src).filter(s => !s.includes('avatar') && !s.includes('profile'));
      const vids = Array.from(document.querySelectorAll('video')).map(v => v.src || v.currentSrc);
      return { postLinks: uniqueLinks, imagesCount: imgs.length, videosCount: vids.length };
    });

    console.log(`Tab ${tab || 'feed'}:`, data);
  }

  await browser.close();
}

checkMandiir();
