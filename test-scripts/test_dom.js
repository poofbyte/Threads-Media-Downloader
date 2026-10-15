const puppeteer = require('puppeteer-core');

async function testDom() {
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

  // Check login dialog or buttons or barriers
  const info = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).map(d => d.innerText);
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText).filter(Boolean);
    const postLinks = Array.from(document.querySelectorAll('a[href*="/post/"]')).map(a => a.href);
    return {
      dialogs,
      buttons: buttons.slice(0, 10),
      postLinksCount: postLinks.length,
      postLinks: postLinks.slice(0, 5),
      bodyTextLength: document.body.innerText.length,
      scrollHeight: document.body.scrollHeight
    };
  });

  console.log('Page info:', info);
  await page.screenshot({ path: 'test_screen.png' });
  console.log('Screenshot saved to test_screen.png');

  await browser.close();
}

testDom();
