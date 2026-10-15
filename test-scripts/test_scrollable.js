const puppeteer = require('puppeteer-core');

async function testScrollable() {
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
  await page.goto('https://www.threads.net/@zuck', { waitUntil: 'networkidle2' });

  const scrollInfo = await page.evaluate(() => {
    const scrollables = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 200) {
        scrollables.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight
        });
      }
    }
    return {
      windowScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      scrollables
    };
  });

  console.log('Scrollable elements:', scrollInfo);
  await browser.close();
}

testScrollable();
