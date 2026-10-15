const fs = require('fs');

async function test() {
  try {
    const res = await fetch('https://www.threads.net/@zuck', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document'
      }
    });
    const text = await res.text();
    fs.writeFileSync('threads_sample.html', text);
    console.log('Saved threads_sample.html');

    // Find all JSON scripts
    const regex = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
    let match;
    let index = 0;
    while ((match = regex.exec(text)) !== null) {
      const content = match[1];
      if (content.includes('zuck') || content.includes('user_id') || content.includes('mediaData') || content.includes('xdt_api')) {
        console.log(`Script ${index} matched keywords, length: ${content.length}`);
        fs.writeFileSync(`script_${index}.json`, content);
      }
      index++;
    }

    // Check for user ID patterns in the entire text
    const idRegexes = [
      /"user_id":\s*"(\d+)"/g,
      /"pk":\s*"(\d+)"/g,
      /"id":\s*"(\d+)"/g,
      /"target_user_id":\s*"(\d+)"/g,
      /"props":\{"id":"(\d+)"/g,
      /user_id=(\d+)/g,
      /"profile_user_id":\s*"(\d+)"/g
    ];
    for (const r of idRegexes) {
      const matches = [...text.matchAll(r)].map(m => m[1]);
      if (matches.length > 0) {
        console.log(`Pattern ${r}:`, matches.slice(0, 5));
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}
test();
