const puppeteer = require('puppeteer-core');

async function findCurrentDocIds() {
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
  const scriptUrls = [];
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('.js') && u.includes('rsrc.php')) {
      scriptUrls.push(u);
    }
  });

  await page.goto('https://www.threads.net/@zuck', { waitUntil: 'networkidle2' });

  console.log(`Found ${scriptUrls.length} script URLs.`);

  // Search in page memory or scripts for Profile / Media query names
  const matches = await page.evaluate(async () => {
    // Check embedded JSON scripts first
    const found = [];
    document.querySelectorAll('script').forEach(s => {
      const text = s.textContent || '';
      const docMatches = text.matchAll(/doc_id:"?(\d{15,20})"?/g);
      for (const m of docMatches) {
        found.push({ type: 'inline_script', docId: m[1] });
      }
      const queryMatches = text.matchAll(/([A-Za-z0-9_]+Query)[^}]*?id:"?(\d{15,20})"?/g);
      for (const m of queryMatches) {
        found.push({ query: m[1], docId: m[2] });
      }
    });
    return found;
  });

  console.log('Matches from inline scripts:', matches);
  await browser.close();
}

findCurrentDocIds();
