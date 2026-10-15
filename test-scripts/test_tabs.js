const puppeteer = require('puppeteer-core');

async function testTabs() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  
  for (const tab of ['media', 'replies']) {
    console.log(`\n--- Testing tab: @zuck/${tab} ---`);
    await page.goto(`https://www.threads.net/@zuck/${tab}`, { waitUntil: 'networkidle2' });
    const postCount = await page.evaluate(() => document.querySelectorAll('a[href*="/post/"]').length);
    const mediaCount = await page.evaluate(() => document.querySelectorAll('img, video').length);
    console.log(`Tab ${tab}: ${postCount} post links, ${mediaCount} media elements in DOM`);
  }

  await browser.close();
}

testTabs();
