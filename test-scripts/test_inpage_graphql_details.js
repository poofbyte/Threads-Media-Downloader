const puppeteer = require('puppeteer-core');

async function testInPageGraphQLDetails() {
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
  await page.goto('https://www.threads.net/@zuck', { waitUntil: 'networkidle2' });

  const result = await page.evaluate(async () => {
    let endCursor = null;
    let userId = null;
    let lsd = null;

    document.querySelectorAll('script[type="application/json"]').forEach(s => {
      try {
        const text = s.textContent;
        if (!userId) {
          const uMatch = text.match(/"user_id":"?(\d+)"?/);
          if (uMatch) userId = uMatch[1];
        }
        if (!endCursor) {
          const cMatch = text.match(/"end_cursor":"([^"]+)"/);
          if (cMatch) endCursor = cMatch[1];
        }
        if (!lsd) {
          const lMatch = text.match(/"LSD",\[\],\{"token":"([^"]+)"\}/) || text.match(/"token":"([^"]+)"/);
          if (lMatch) lsd = lMatch[1];
        }
      } catch (e) {}
    });

    const getCookie = (name) => {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? match[2] : '';
    };

    const csrf = getCookie('csrftoken');

    const variables = {
      userID: userId,
      first: 10,
      after: endCursor,
      __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: false,
      __relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider: true
    };

    const params = new URLSearchParams();
    if (lsd) params.set('lsd', lsd);
    params.set('fb_api_caller_class', 'RelayModern');
    params.set('fb_api_req_friendly_name', 'BarcelonaProfileMediaTabDirectQuery');
    params.set('variables', JSON.stringify(variables));
    params.set('doc_id', '26162887256693931');

    const resp = await fetch('/graphql/query', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-fb-lsd': lsd || '',
        'x-csrftoken': csrf || '',
        'x-ig-app-id': '238260118697367',
        'x-asbd-id': '129477',
        'x-fb-friendly-name': 'BarcelonaProfileMediaTabDirectQuery'
      },
      body: params.toString()
    });

    return await resp.json();
  });

  console.log('In-page GraphQL Response:', JSON.stringify(result, null, 2).slice(0, 1500));
  await browser.close();
}

testInPageGraphQLDetails();
