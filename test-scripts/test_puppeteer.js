const puppeteer = require('puppeteer-core');

async function testChrome() {
  console.log('Testing Chrome launch via puppeteer-core...');
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

  try {
    const page = await browser.newPage();
    console.log('Navigating to https://www.threads.net/@zuck ...');
    
    // Intercept GraphQL responses!
    let capturedGraphQL = 0;
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/graphql/query')) {
        capturedGraphQL++;
        try {
          const json = await response.json();
          console.log(`[Network Intercept] GraphQL query response #${capturedGraphQL}! Keys:`, Object.keys(json));
          if (json.data && json.data.mediaData) {
            console.log('  -> Captured mediaData! Post edges:', json.data.mediaData.edges ? json.data.mediaData.edges.length : 0);
          }
        } catch (e) {}
      }
    });

    await page.goto('https://www.threads.net/@zuck', { waitUntil: 'networkidle2', timeout: 30000 });
    const title = await page.title();
    console.log('Page Title:', title);

    // Test a scroll
    console.log('Scrolling down to trigger more posts...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 4000));
    console.log('After scroll, total GraphQL responses intercepted:', capturedGraphQL);

    await browser.close();
    console.log('Browser closed cleanly. Test PASSED!');
  } catch (err) {
    console.error('Error during test:', err);
    await browser.close();
  }
}

testChrome();
