const puppeteer = require('puppeteer-core');

async function testInfiniteScroll() {
  console.log('Testing infinite scroll without cookies...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    ],
    defaultViewport: { width: 1280, height: 900 }
  });

  const page = await browser.newPage();
  
  // Track all network requests to see if GraphQL is triggered on scroll
  let graphqlCount = 0;
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('graphql')) {
      graphqlCount++;
      console.log(`[Network] GraphQL #${graphqlCount}: ${u.slice(0, 80)}`);
    }
  });

  await page.goto('https://www.threads.net/@zuck', { waitUntil: 'networkidle2' });

  // Dismiss barrier dialog
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"]').forEach(d => {
      let p = d.parentElement;
      while (p && p !== document.body) {
        if (window.getComputedStyle(p).position === 'fixed') { p.remove(); break; }
        p = p.parentElement;
      }
      d.remove();
    });
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  });

  // Test method 1: page.mouse.wheel
  console.log('\n--- Testing page.mouse.wheel ---');
  for (let i = 1; i <= 8; i++) {
    // Hover in center of screen
    await page.mouse.move(640, 500);
    await page.mouse.wheel({ deltaY: 1200 });
    await new Promise(r => setTimeout(r, 2000));
    const count = await page.evaluate(() => document.querySelectorAll('a[href*="/post/"]').length);
    console.log(`Wheel #${i} -> Visible post links: ${count}, GraphQL calls: ${graphqlCount}`);
  }

  // Test method 2: page.keyboard.press('PageDown')
  console.log('\n--- Testing page.keyboard PageDown ---');
  for (let i = 1; i <= 8; i++) {
    await page.keyboard.press('PageDown');
    await new Promise(r => setTimeout(r, 2000));
    const count = await page.evaluate(() => document.querySelectorAll('a[href*="/post/"]').length);
    console.log(`PageDown #${i} -> Visible post links: ${count}, GraphQL calls: ${graphqlCount}`);
  }

  await browser.close();
}

testInfiniteScroll();
