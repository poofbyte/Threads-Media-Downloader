const fs = require('fs');

for (const file of ['script_10.json', 'script_14.json', 'script_22.json']) {
  const path = `test-scripts/${file}`;
  if (!fs.existsSync(path)) continue;
  const content = fs.readFileSync(path, 'utf8');
  console.log(`\n=== Scanning ${file} for Avatar URLs ===`);
  
  const matches = content.matchAll(/"(profile_pic_url|profile_pic_url_hd|hd_profile_pic_url_info)":\s*("([^"]+)"|(\{[^}]+\}))/g);
  for (const m of matches) {
    console.log(`Key: ${m[1]} -> ${m[2].slice(0, 100)}...`);
  }

  // Also check "user" object keys
  const userMatches = content.matchAll(/"user":\s*(\{[^}]+\})/g);
  for (const m of userMatches) {
    if (m[1].includes('profile_pic')) {
      console.log('User object slice:', m[1].slice(0, 150));
    }
  }
}
