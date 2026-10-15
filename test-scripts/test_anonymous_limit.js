const puppeteer = require('puppeteer-core');

async function testAnonymousLimit() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('response', async res => {
    if (res.url().includes('graphql')) {
      try {
        const text = await res.text();
        console.log(`[GraphQL Resp] url: ${res.url()} length: ${text.length} sample: ${text.slice(0, 150)}`);
      } catch (e) {}
    }
  });

  console.log('Navigating to @zuck...');
  await page.goto('https://www.threads.net/@zuck', { waitUntil: 'networkidle2' });

  // Check login dialog or backdrop
  const dialogInfo = await page.evaluate(() => {
    const dialogs = document.querySelectorAll('[role="dialog"]');
    return {
      dialogCount: dialogs.length,
      dialogTexts: Array.from(dialogs).map(d => d.innerText.slice(0, 80))
    };
  });
  console.log('Dialogs present:', dialogInfo);

  // Check posts before dismiss
  const postsBefore = await page.evaluate(() => document.querySelectorAll('a[href*="/post/"]').length);
  console.log('Posts in DOM before dismiss:', postsBefore);

  // Dismiss dialog
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

  // Now simulate real user scroll: mouse scroll, scrollview scroll, window scroll
  console.log('\n--- Scrolling ---');
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(600, 400);
    await page.mouse.wheel({ deltaY: 2000 });
    await page.evaluate(() => {
      window.scrollBy(0, 1500);
      const sv = document.getElementById('scrollview') || document.querySelector('div[style*="overflow-y"]');
      if (sv) sv.scrollTop += 1500;
    });
    await new Promise(r => setTimeout(r, 2000));
    const pCount = await page.evaluate(() => document.querySelectorAll('a[href*="/post/"]').length);
    console.log(`Scroll #${i} -> Visible post links: ${pCount}`);
  }

  // Check if there is an explicit "Log in to see more" or button at bottom
  const bottomElements = await page.evaluate(() => {
    const textNodes = [];
    document.querySelectorAll('span, div, h2, h3').forEach(el => {
      const txt = (el.innerText || '').trim();
      if (txt.includes('Log in') || txt.includes('Sign up') || txt.includes('see more') || txt.includes('more posts')) {
        textNodes.push({ tag: el.tagName, text: txt.slice(0, 60) });
      }
    });
    return textNodes.slice(0, 10);
  });
  console.log('Bottom/wall elements found:', bottomElements);

  await browser.close();
}

testAnonymousLimit();
