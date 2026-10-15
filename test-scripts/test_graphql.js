const fs = require('fs');

async function testGraphQL() {
  const userId = '63055343223';
  const endCursor = 'QVFCeVF5LWRWNGZkaVdFVktKeE5KT2xaa3BHWWFSNjdtQWxYdHNZN0lJdlVQZng0VzNnM0VLbGRVMkwwZXVjcWNNUU0xejdjaXRvOThWYUxielBBbkEtWQ==';
  
  // From HTML probe earlier:
  // lsd match: AdR5iGBuNpKh2NXr1YmLYV7vm-U
  // app_id match: 238260118697367
  const lsd = 'AdR5iGBuNpKh2NXr1YmLYV7vm-U';
  const appId = '238260118697367';

  // Let's test GraphQL query with doc_id 26162887256693931 (logged out)
  const variables = {
    userID: userId,
    first: 10,
    after: endCursor,
    __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: false,
    __relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider: true
  };

  const body = new URLSearchParams();
  body.set('lsd', lsd);
  body.set('fb_api_caller_class', 'RelayModern');
  body.set('fb_api_req_friendly_name', 'BarcelonaProfileMediaTabDirectQuery');
  body.set('variables', JSON.stringify(variables));
  body.set('doc_id', '26162887256693931');

  try {
    const res = await fetch('https://www.threads.net/graphql/query', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-fb-lsd': lsd,
        'x-ig-app-id': appId,
        'x-asbd-id': '129477',
        'x-fb-friendly-name': 'BarcelonaProfileMediaTabDirectQuery',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Origin': 'https://www.threads.net',
        'Referer': 'https://www.threads.net/@zuck',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty'
      },
      body: body.toString()
    });

    console.log('GraphQL status:', res.status);
    const json = await res.json();
    console.log('GraphQL response keys:', Object.keys(json));
    if (json.data && json.data.mediaData) {
      console.log('Got mediaData! Edges:', json.data.mediaData.edges ? json.data.mediaData.edges.length : 0);
      console.log('New page_info:', json.data.mediaData.page_info);
    } else {
      console.log('Response content:', JSON.stringify(json).slice(0, 500));
    }
  } catch (err) {
    console.error('GraphQL Error:', err);
  }
}

testGraphQL();
