const puppeteer = require('puppeteer-core');

async function testApiGraphql() {
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
  
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('graphql')) {
      console.log('Intercepted graphql url:', u);
      try {
        const text = await res.text();
        console.log('Graphql response sample:', text.slice(0, 300));
      } catch (e) {
        console.log('Could not read graphql text:', e.message);
      }
    }
  });

  await page.goto('https://www.threads.net/@zuck', { waitUntil: 'networkidle2' });

  // Scroll down multiple times
  for (let i = 1; i <= 5; i++) {
    console.log(`Scroll #${i}`);
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, 1500));
  }

  await browser.close();
  console.log('Done test');
}

testApiGraphql();
