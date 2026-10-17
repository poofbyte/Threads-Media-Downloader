async function testZipEndpoints() {
  // Test 1: GET /api/download-zip with username
  console.log('Testing GET /api/download-zip...');
  const res1 = await fetch('http://localhost:3000/api/download-zip?username=testuser');
  console.log('GET without cache status (expected 400):', res1.status);

  // Test 2: POST /api/download-zip with valid lightweight items
  console.log('\nTesting POST /api/download-zip with lightweight items...');
  const res2 = await fetch('http://localhost:3000/api/download-zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileName: 'laaaam_iya',
      items: [
        {
          filename: 'laaaam_iya_1.jpg',
          url: 'https://instagram.fjsr8-2.fna.fbcdn.net/v/t51.82787-19/825322135_17989325280103224_1252773933700107438_n.jpg?stp=dst-jpg_s320x320_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=instagram.fjsr8-1.fna.fbcdn.net&_nc_cat=100&_nc_oc=Q6cZ2gFVfnrOhCOsQ2uI5OUWmV5diajy7-UmdqOqLgeLBTCiyAP2ThvA-4IbIsdUpUmyyWc&_nc_ohc=bH4oqxzxeh8Q7kNvwE8TTuR&_nc_gid=PhN8opsZvpXgrUzdtyh3xg&edm=APs17CUBAAAA&ccb=7-5&oh=00_AQM53sthJCxysEJCovS1lFA7MNdlBaqrOLOUA1np2H4bPw&oe=6AD6812B&_nc_sid=10d13b'
        }
      ]
    })
  });
  console.log('POST status:', res2.status);
  console.log('Content-Disposition:', res2.headers.get('content-disposition'));
  console.log('Content-Length:', res2.headers.get('content-length'));

  // Test 3: Test bad JSON to ensure error middleware catches it cleanly without crashing or dumping traces
  console.log('\nTesting malformed JSON handling...');
  const res3 = await fetch('http://localhost:3000/api/download-zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"bad":"json"}{"extra":"junk"}'
  });
  console.log('Malformed JSON status (expected 400 clean):', res3.status);
  const jsonErr = await res3.json();
  console.log('Malformed JSON response:', jsonErr);
}

testZipEndpoints();
