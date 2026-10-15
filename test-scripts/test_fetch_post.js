async function testFetchPost() {
  const url = 'https://www.threads.net/@zuck/post/DeZtp-TkQHh';
  console.log('Testing direct fetch to post:', url);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  console.log('Direct post fetch status:', res.status);
  const html = await res.text();
  console.log('HTML size:', html.length);
  const hasThreadItems = html.includes('thread_items');
  const hasImages = html.includes('image_versions2');
  console.log('Has thread_items:', hasThreadItems, 'Has image_versions2:', hasImages);
}

testFetchPost();
