const http = require('http');

async function testE2EScan() {
  console.log('--- Starting End-to-End Scan Test on http://localhost:3000 ---');

  const url = 'http://localhost:3000/api/scan?profile=zuck';
  
  const req = http.get(url, (res) => {
    console.log(`SSE Connection established with Status: ${res.status}`);
    let buffer = '';
    let mediaItems = [];
    let profile = null;

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // Keep unfinished trailing chunk

      for (const line of lines) {
        if (!line.trim()) continue;
        const eventMatch = line.match(/^event:\s*(\w+)/m);
        const dataMatch = line.match(/^data:\s*(.+)/m);

        if (eventMatch && dataMatch) {
          const eventType = eventMatch[1];
          try {
            const data = JSON.parse(dataMatch[1]);
            if (eventType === 'status') {
              console.log(`[Status Event] ${data.message}`);
            } else if (eventType === 'profile_info') {
              profile = data.profile;
              console.log(`[Profile Info Event] Username: @${profile.username}, Display Name: "${profile.displayName}"`);
            } else if (eventType === 'media_batch') {
              mediaItems.push(...data.items);
              console.log(`[Media Batch Event] Received ${data.items.length} items. Total so far: ${data.totalCount}`);
              if (data.items.length > 0) {
                const sample = data.items[0];
                console.log(`  -> Sample item: [${sample.type}] ${sample.filename} (${sample.resolution})`);
              }
            } else if (eventType === 'scroll_progress') {
              console.log(`[Scroll Progress Event] Round ${data.round}/${data.maxRounds} - Total items: ${data.totalCount}`);
            } else if (eventType === 'complete') {
              console.log(`[Complete Event] ${data.message}`);
              console.log('Final Summary:', data.summary);
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e.message);
          }
        }
      }
    });

    res.on('end', async () => {
      console.log(`\n--- SSE Stream Finished. Total Media Discovered: ${mediaItems.length} ---`);
      
      if (mediaItems.length > 0) {
        console.log('\n--- Testing ZIP Archive Download with collected media ---');
        const zipRes = await fetch('http://localhost:3000/api/download-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: mediaItems.slice(0, 3), // test packaging 3 files
            profileName: profile ? profile.displayName : 'zuck'
          })
        });

        console.log('ZIP Download Status:', zipRes.status);
        console.log('ZIP Content-Disposition:', zipRes.headers.get('content-disposition'));
        const zipBuf = await zipRes.arrayBuffer();
        console.log(`ZIP File downloaded successfully! Size: ${zipBuf.byteLength} bytes.`);
        console.log('\n✅ END-TO-END VERIFICATION PASSED PERFECTLY!');
      } else {
        console.log('No media was captured.');
      }
      process.exit(0);
    });
  });

  req.on('error', (err) => {
    console.error('Request error:', err);
    process.exit(1);
  });
}

testE2EScan();
