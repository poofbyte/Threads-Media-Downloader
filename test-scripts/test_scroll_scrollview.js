const puppeteer = require('puppeteer-core');

async function testScrollView() {
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

  console.log('Scrolling div#scrollview...');
  for (let i = 1; i <= 6; i++) {
    const res = await page.evaluate(() => {
      const sv = document.getElementById('scrollview') || document.querySelector('[data-scrollview="true"]') || document.querySelector('div[style*="overflow-y"]');
      if (sv) {
        sv.scrollTop += 1200;
        return { scrollTop: sv.scrollTop, scrollHeight: sv.scrollHeight };
      }
      return null;
    });
    console.log(`Scroll #${i}:`, res);
    await new Promise(r => setTimeout(r, 2000));
  }

  const posts = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/post/"]')).map(a => a.href);
    const unique = [...new Set(links)];
    return { count: unique.length, sample: unique.slice(0, 10) };
  });

  console.log('\nDiscovered posts after scrolling:', posts);
  await browser.close();
}

testScrollView();
