const puppeteer = require('puppeteer-core');

async function testDismiss() {
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

  // Remove barrier
  const removed = await page.evaluate(() => {
    let count = 0;
    document.querySelectorAll('[role="dialog"]').forEach(el => {
      // Find parent backdrop/overlay
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        if (window.getComputedStyle(parent).position === 'fixed' || window.getComputedStyle(parent).position === 'absolute') {
          parent.remove();
          count++;
          break;
        }
        parent = parent.parentElement;
      }
      if (!parent || parent === document.body) {
        el.remove();
        count++;
      }
    });
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    return { removedCount: count, newScrollHeight: document.body.scrollHeight };
  });

  console.log('Barrier removed:', removed);

  // Scroll down
  for (let i = 1; i <= 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await new Promise(r => setTimeout(r, 2000));
  }

  const afterScroll = await page.evaluate(() => {
    const postLinks = Array.from(document.querySelectorAll('a[href*="/post/"]')).map(a => a.href);
    return { postLinksCount: postLinks.length, scrollHeight: document.body.scrollHeight };
  });

  console.log('After removing barrier and scrolling:', afterScroll);
  await browser.close();
}

testDismiss();
