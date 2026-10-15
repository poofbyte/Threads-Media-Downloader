const puppeteer = require('puppeteer-core');
const { extractMediaFromPost, deduplicateMedia, sanitizeFilename, inferExtension } = require('./media-extractor');

// Default Chrome executable path on Windows
const DEFAULT_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/**
 * Clean and normalize user input into a Threads username and URL
 */
function normalizeProfileInput(input) {
  if (!input || typeof input !== 'string') return null;
  let str = input.trim();
  
  // Strip leading @
  if (str.startsWith('@')) {
    str = str.slice(1);
  }

  // Check if it's a URL
  try {
    if (str.startsWith('http://') || str.startsWith('https://')) {
      const u = new URL(str);
      const match = u.pathname.match(/@([^/?#]+)/);
      if (match) {
        return {
          username: match[1],
          profileUrl: `https://www.threads.net/@${match[1]}`,
          mediaUrl: `https://www.threads.net/@${match[1]}/media`,
          repliesUrl: `https://www.threads.net/@${match[1]}/replies`
        };
      }
    }
  } catch (e) {}

  // Pure username
  const cleanUsername = str.replace(/[^a-zA-Z0-9._]/g, '');
  if (!cleanUsername) return null;

  return {
    username: cleanUsername,
    profileUrl: `https://www.threads.net/@${cleanUsername}`,
    mediaUrl: `https://www.threads.net/@${cleanUsername}/media`,
    repliesUrl: `https://www.threads.net/@${cleanUsername}/replies`
  };
}

/**
 * Parse user-provided cookies from either string or JSON format
 */
function parseCookies(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return [];
  const trimmed = rawInput.trim();
  if (!trimmed) return [];

  const cookies = [];

  // Try parsing as JSON array first (e.g. from Cookie-Editor / EditThisCookie)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.name && item.value) {
            cookies.push({
              name: String(item.name).trim(),
              value: String(item.value).trim(),
              domain: item.domain || '.threads.net',
              path: item.path || '/'
            });
          }
        }
        if (cookies.length > 0) return cookies;
      }
    } catch (e) {}
  }

  // Parse standard header format: "key1=value1; key2=value2"
  const pairs = trimmed.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (key && val) {
        cookies.push({
          name: key,
          value: val,
          domain: '.threads.net',
          path: '/'
        });
      }
    }
  }

  return cookies;
}

/**
 * Deep search in an object for matching keys (increased depth to 40 for deep relay caches)
 */
function findInObject(obj, targetKey, maxDepth = 40, currentDepth = 0) {
  if (!obj || typeof obj !== 'object' || currentDepth > maxDepth) return null;
  if (Object.prototype.hasOwnProperty.call(obj, targetKey)) {
    return obj[targetKey];
  }
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    if (val && typeof val === 'object') {
      const found = findInObject(val, targetKey, maxDepth, currentDepth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find all occurrences of targetKey in an object
 */
function findAllInObject(obj, targetKey, maxDepth = 40, currentDepth = 0, results = []) {
  if (!obj || typeof obj !== 'object' || currentDepth > maxDepth) return results;
  if (Object.prototype.hasOwnProperty.call(obj, targetKey)) {
    results.push(obj[targetKey]);
  }
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    if (val && typeof val === 'object') {
      findAllInObject(val, targetKey, maxDepth, currentDepth + 1, results);
    }
  }
  return results;
}

/**
 * Extract all post objects from a JSON string or object
 */
function extractPostsFromScript(scriptTxt) {
  const posts = [];
  try {
    const parsed = typeof scriptTxt === 'string' ? JSON.parse(scriptTxt) : scriptTxt;
    
    // 1. Thread items
    const allThreadItems = findAllInObject(parsed, 'thread_items', 40);
    for (const group of allThreadItems) {
      if (Array.isArray(group)) {
        for (const ti of group) {
          if (ti && ti.post) posts.push(ti.post);
        }
      }
    }

    // 2. MediaData edges
    const allMediaData = findAllInObject(parsed, 'mediaData', 40);
    for (const md of allMediaData) {
      if (md && Array.isArray(md.edges)) {
        for (const edge of md.edges) {
          const items = edge.node?.thread_items || [];
          for (const ti of items) {
            if (ti && ti.post) posts.push(ti.post);
          }
        }
      }
    }
  } catch (e) {}
  return posts;
}

/**
 * Intelligent Threads Scraper Engine
 */
class ThreadsScraper {
  constructor(options = {}) {
    this.chromePath = options.chromePath || DEFAULT_CHROME_PATH;
    this.browser = null;
    this.isCancelled = false;
  }

  cancel() {
    this.isCancelled = true;
  }

  async scrape(input, cookiesRaw = null, onProgress = () => {}) {
    this.isCancelled = false;
    const normalized = normalizeProfileInput(input);
    if (!normalized) {
      throw new Error('Invalid Threads profile or username. Please enter a valid @username or Threads URL.');
    }

    const { username, profileUrl, mediaUrl, repliesUrl } = normalized;
    onProgress({ type: 'status', message: `Initializing scanner for @${username}...`, stage: 'init' });

    let collectedMedia = [];
    const discoveredPostCodes = new Set();
    const unpackedPostCodes = new Set();

    let profileData = {
      username,
      displayName: username,
      avatarUrl: null,
      bio: null,
      verified: false
    };

    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        executablePath: this.chromePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1280,900',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ],
        defaultViewport: { width: 1280, height: 900 }
      });

      const page = await this.browser.newPage();

      // Configure cookies if provided
      const parsedCookies = parseCookies(cookiesRaw);
      if (parsedCookies.length > 0) {
        onProgress({ type: 'status', message: `Applying ${parsedCookies.length} session cookies for authenticated scanning...`, stage: 'auth' });
        try {
          await page.setCookie(...parsedCookies);
          const threadsComCookies = parsedCookies.map(c => ({ ...c, domain: '.threads.com' }));
          await page.setCookie(...threadsComCookies);
        } catch (cookieErr) {
          console.warn('Cookie application warning:', cookieErr.message);
        }
      }

      // Network Interceptor: capture any GraphQL responses
      page.on('response', async (response) => {
        if (this.isCancelled) return;
        const url = response.url();
        if (url.includes('/api/graphql') || url.includes('/graphql/query')) {
          try {
            const json = await response.json();
            const posts = extractPostsFromScript(json);
            if (posts.length > 0) {
              const newMedia = [];
              for (const post of posts) {
                if (post.code) {
                  discoveredPostCodes.add(post.code);
                  unpackedPostCodes.add(post.code);
                }
                const extracted = extractMediaFromPost(post, username);
                newMedia.push(...extracted);
              }
              if (newMedia.length > 0) {
                collectedMedia.push(...newMedia);
                collectedMedia = deduplicateMedia(collectedMedia);
                onProgress({
                  type: 'media_batch',
                  items: collectedMedia,
                  totalCount: collectedMedia.length,
                  message: `Collected ${collectedMedia.length} high-res media files...`
                });
              }
            }
          } catch (e) {}
        }
      });

      // Helper to dismiss login barrier dialog, bottom consent bar, and restore scrollability
      const dismissOverlays = async () => {
        await page.evaluate(() => {
          // 1. Inject permanent CSS rule to prevent dialog from reappearing on scroll
          if (!document.getElementById('threads-bypass-css')) {
            const style = document.createElement('style');
            style.id = 'threads-bypass-css';
            style.textContent = `
              [role="dialog"] { display: none !important; }
              div[style*="position: fixed"][style*="z-index: 2"] { display: none !important; }
              body, html, #scrollview, div[data-scrollview="true"] { 
                overflow: auto !important; 
                overflow-y: auto !important; 
              }
            `;
            document.head.appendChild(style);
          }

          // 2. Remove existing dialog trees from DOM
          document.querySelectorAll('[role="dialog"]').forEach(d => {
            let p = d.parentElement;
            while (p && p !== document.body) {
              const pos = window.getComputedStyle(p).position;
              if (pos === 'fixed' || pos === 'absolute') { p.remove(); break; }
              p = p.parentElement;
            }
            d.remove();
          });

          // 3. Remove bottom consent / terms banner if present
          document.querySelectorAll('div').forEach(el => {
            const text = (el.innerText || '');
            if (text.includes('By continuing, you agree to the Threads Terms') || text.includes('Terms of Use, the Meta Privacy Policy')) {
              let target = el;
              while (target && target.parentElement !== document.body) {
                if (window.getComputedStyle(target).position === 'fixed') { target.remove(); break; }
                target = target.parentElement;
              }
              if (target) target.remove();
            }
          });

          // 4. Force scroll enablement
          document.body.style.overflow = 'auto';
          document.documentElement.style.overflow = 'auto';
          const sv = document.getElementById('scrollview') || document.querySelector('div[style*="overflow-y"]');
          if (sv) sv.style.overflowY = 'auto';
        });
      };

      // 1. Navigate to main profile page
      onProgress({ type: 'status', message: `Opening profile page for @${username}...`, stage: 'loading_profile' });
      await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 35000 });
      await dismissOverlays();

      // Extract initial embedded profile metadata & script JSON
      const initialData = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        const displayName = h1 ? h1.innerText.trim() : null;

        // Avatar
        let avatarUrl = null;
        const avatarImg = document.querySelector('img[alt*="profile picture"], img[alt*="Profile picture"], header img');
        if (avatarImg && avatarImg.src && !avatarImg.src.startsWith('data:')) {
          avatarUrl = avatarImg.src;
        }

        // Bio
        let bio = null;
        const bioEl = document.querySelector('header span[dir="auto"], div[data-pressable-container="true"] span');
        if (bioEl) bio = bioEl.innerText.trim();

        // Collect scripts
        const jsonScripts = [];
        document.querySelectorAll('script[type="application/json"]').forEach(s => {
          try {
            const txt = s.textContent;
            if (txt) {
              if (!avatarUrl) {
                const picMatch = txt.match(/"profile_pic_url":\s*"([^"]+)"/) || txt.match(/"profile_pic_url_hd":\s*"([^"]+)"/);
                if (picMatch) avatarUrl = picMatch[1].replace(/\\/g, '');
              }
              if (!bio) {
                const bioMatch = txt.match(/"biography":\s*"([^"]+)"/);
                if (bioMatch) bio = bioMatch[1].replace(/\\n/g, ' ').trim();
              }
              if (txt.includes('thread_items') || txt.includes('mediaData') || txt.includes('image_versions2')) {
                jsonScripts.push(txt);
              }
            }
          } catch (e) {}
        });

        return { displayName, avatarUrl, bio, jsonScripts };
      });

      if (initialData.displayName) profileData.displayName = initialData.displayName;
      if (initialData.avatarUrl) profileData.avatarUrl = initialData.avatarUrl;
      if (initialData.bio) profileData.bio = initialData.bio;

      onProgress({
        type: 'profile_info',
        profile: profileData,
        message: `Connected to @${username} (${profileData.displayName})`
      });

      // Parse JSON from initial embedded scripts
      for (const scriptTxt of initialData.jsonScripts || []) {
        const posts = extractPostsFromScript(scriptTxt);
        for (const post of posts) {
          if (post.code) {
            discoveredPostCodes.add(post.code);
            const isFullCarousel = Array.isArray(post.carousel_media) && post.carousel_media.length >= (post.carousel_media_count || 1);
            if (!post.carousel_media_count || isFullCarousel) {
              unpackedPostCodes.add(post.code);
            }
          }
          const extracted = extractMediaFromPost(post, username);
          collectedMedia.push(...extracted);
        }
      }

      collectedMedia = deduplicateMedia(collectedMedia);
      if (collectedMedia.length > 0) {
        onProgress({
          type: 'media_batch',
          items: collectedMedia,
          totalCount: collectedMedia.length,
          message: `Discovered ${collectedMedia.length} high-res media files from main feed...`
        });
      }

      // Helper function to extract DOM media and post links from current page
      const extractCurrentPageDOM = async (tabLabel = '') => {
        const domResult = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href*="/post/"]')).map(a => {
            const m = a.href.match(/\/@[^/]+\/post\/([^/?#]+)/);
            return m ? m[1] : null;
          }).filter(Boolean);

          const imgs = [];
          document.querySelectorAll('img').forEach(img => {
            if (img.src && !img.src.includes('avatar') && !img.src.includes('profile') && (img.naturalWidth > 140 || img.width > 140)) {
              imgs.push({
                url: img.src,
                width: img.naturalWidth || img.width || 0,
                height: img.naturalHeight || img.height || 0
              });
            }
          });

          const vids = [];
          document.querySelectorAll('video').forEach(v => {
            const src = v.currentSrc || v.src || (v.querySelector('source') ? v.querySelector('source').src : '');
            if (src && !src.startsWith('blob:')) {
              vids.push({ url: src, poster: v.poster || '' });
            }
          });

          return { links: [...new Set(links)], imgs, vids };
        });

        // Add discovered post links
        domResult.links.forEach(code => discoveredPostCodes.add(code));

        // Add DOM images
        domResult.imgs.forEach((item, idx) => {
          const ext = inferExtension(item.url, 'image');
          collectedMedia.push({
            id: `dom_${tabLabel}_img_${idx}_${item.url.slice(-25)}`,
            postId: 'dom',
            code: '',
            postUrl: null,
            type: 'image',
            url: item.url,
            previewUrl: item.url,
            width: item.width,
            height: item.height,
            resolution: item.width && item.height ? `${item.width}x${item.height}` : 'Original',
            caption: '',
            takenAt: null,
            username,
            isCarousel: false,
            filename: sanitizeFilename(`${username}_${tabLabel}_${idx + 1}.${ext}`)
          });
        });

        // Add DOM videos
        domResult.vids.forEach((item, idx) => {
          const ext = inferExtension(item.url, 'video');
          collectedMedia.push({
            id: `dom_${tabLabel}_vid_${idx}_${item.url.slice(-25)}`,
            postId: 'dom',
            code: '',
            postUrl: null,
            type: 'video',
            url: item.url,
            previewUrl: item.poster || null,
            width: null,
            height: null,
            resolution: 'HD Video',
            caption: '',
            takenAt: null,
            username,
            isCarousel: false,
            filename: sanitizeFilename(`${username}_${tabLabel}_video_${idx + 1}.${ext}`)
          });
        });

        collectedMedia = deduplicateMedia(collectedMedia);
      };

      // Smoothly scroll Tab 1 (Main Feed) to trigger lazy-loaded DOM elements and pagination
      const mainFeedScrollRounds = parsedCookies.length > 0 ? 15 : 4;
      for (let s = 1; s <= mainFeedScrollRounds; s++) {
        if (this.isCancelled) break;
        await page.evaluate(() => {
          const sv = document.getElementById('scrollview') || document.querySelector('div[style*="overflow-y"]');
          if (sv) sv.scrollTop += 1200;
          window.scrollBy(0, 1200);
        });
        await page.mouse.wheel({ deltaY: 1000 });
        await new Promise(r => setTimeout(r, 1000));
      }
      await extractCurrentPageDOM('main_feed');

      // 2. Scan Tab 2: Dedicated Media Grid Tab (/media)
      if (!this.isCancelled) {
        onProgress({ type: 'status', message: `Scanning media tab (@${username}/media)...`, stage: 'media_tab' });
        try {
          await page.goto(mediaUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await dismissOverlays();

          // Scroll media grid smoothly
          const mediaScrollRounds = parsedCookies.length > 0 ? 25 : 6;
          let lastCount = collectedMedia.length;
          let stagnant = 0;
          for (let s = 1; s <= mediaScrollRounds; s++) {
            if (this.isCancelled) break;
            await page.evaluate(() => {
              const sv = document.getElementById('scrollview') || document.querySelector('div[style*="overflow-y"]');
              if (sv) sv.scrollTop += 1200;
              window.scrollBy(0, 1200);
            });
            await page.mouse.wheel({ deltaY: 1000 });
            await new Promise(r => setTimeout(r, 1200));

            if (parsedCookies.length > 0) {
              if (collectedMedia.length === lastCount) {
                stagnant++;
                if (stagnant >= 4) break;
              } else {
                stagnant = 0;
                lastCount = collectedMedia.length;
              }
            }
          }

          // Extract embedded scripts from media tab
          const mediaTabScripts = await page.evaluate(() => {
            const arr = [];
            document.querySelectorAll('script[type="application/json"]').forEach(s => {
              const txt = s.textContent;
              if (txt && (txt.includes('thread_items') || txt.includes('mediaData') || txt.includes('carousel_media'))) {
                arr.push(txt);
              }
            });
            return arr;
          });

          for (const s of mediaTabScripts) {
            const posts = extractPostsFromScript(s);
            for (const post of posts) {
              if (post.code) {
                discoveredPostCodes.add(post.code);
                const isFullCarousel = Array.isArray(post.carousel_media) && post.carousel_media.length >= (post.carousel_media_count || 1);
                if (!post.carousel_media_count || isFullCarousel) {
                  unpackedPostCodes.add(post.code);
                }
              }
              const extracted = extractMediaFromPost(post, username);
              collectedMedia.push(...extracted);
            }
          }

          await extractCurrentPageDOM('media_tab');
          onProgress({
            type: 'media_batch',
            items: collectedMedia,
            totalCount: collectedMedia.length,
            message: `Collection updated: ${collectedMedia.length} high-res files...`
          });
        } catch (mediaErr) {
          console.warn('Media tab scan notice:', mediaErr.message);
        }
      }

      // 3. Scan Tab 3: Replies Tab (/replies)
      if (!this.isCancelled) {
        onProgress({ type: 'status', message: `Scanning replies tab (@${username}/replies)...`, stage: 'replies_tab' });
        try {
          await page.goto(repliesUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await dismissOverlays();

          const repliesScrollRounds = parsedCookies.length > 0 ? 15 : 4;
          for (let s = 1; s <= repliesScrollRounds; s++) {
            if (this.isCancelled) break;
            await page.evaluate(() => {
              const sv = document.getElementById('scrollview') || document.querySelector('div[style*="overflow-y"]');
              if (sv) sv.scrollTop += 1200;
              window.scrollBy(0, 1200);
            });
            await page.mouse.wheel({ deltaY: 1000 });
            await new Promise(r => setTimeout(r, 1000));
          }

          const replyScripts = await page.evaluate(() => {
            const arr = [];
            document.querySelectorAll('script[type="application/json"]').forEach(s => {
              const txt = s.textContent;
              if (txt && (txt.includes('thread_items') || txt.includes('mediaData') || txt.includes('carousel_media'))) {
                arr.push(txt);
              }
            });
            return arr;
          });

          for (const s of replyScripts) {
            const posts = extractPostsFromScript(s);
            for (const post of posts) {
              if (post.code) {
                discoveredPostCodes.add(post.code);
                const isFullCarousel = Array.isArray(post.carousel_media) && post.carousel_media.length >= (post.carousel_media_count || 1);
                if (!post.carousel_media_count || isFullCarousel) {
                  unpackedPostCodes.add(post.code);
                }
              }
              const extracted = extractMediaFromPost(post, username);
              collectedMedia.push(...extracted);
            }
          }

          await extractCurrentPageDOM('replies_tab');
          onProgress({
            type: 'media_batch',
            items: collectedMedia,
            totalCount: collectedMedia.length,
            message: `Discovered ${collectedMedia.length} files across profile feeds & media tabs...`
          });
        } catch (repliesErr) {
          console.warn('Replies tab notice:', repliesErr.message);
        }
      }

      // 4. Deep Carousel Unpacking: Inspect any discovered post codes whose full carousel hasn't been parsed
      const postCodesToInspect = Array.from(discoveredPostCodes).filter(code => !unpackedPostCodes.has(code)).slice(0, 30);
      if (postCodesToInspect.length > 0 && !this.isCancelled) {
        onProgress({
          type: 'status',
          message: `Unpacking multi-slide carousels and videos for ${postCodesToInspect.length} posts...`,
          stage: 'unpacking'
        });

        for (let i = 0; i < postCodesToInspect.length; i++) {
          if (this.isCancelled) break;
          const code = postCodesToInspect[i];
          try {
            await page.goto(`https://www.threads.net/@${username}/post/${code}`, { waitUntil: 'networkidle2', timeout: 20000 });
            
            // Extract from scripts
            const postScripts = await page.evaluate(() => {
              const arr = [];
              document.querySelectorAll('script[type="application/json"]').forEach(s => {
                const txt = s.textContent;
                if (txt && (txt.includes('thread_items') || txt.includes('carousel_media') || txt.includes('image_versions2'))) {
                  arr.push(txt);
                }
              });
              return arr;
            });

            for (const s of postScripts) {
              const posts = extractPostsFromScript(s);
              for (const post of posts) {
                const extracted = extractMediaFromPost(post, username);
                collectedMedia.push(...extracted);
              }
            }

            // Also check high-resolution DOM images on the post page
            const domMedia = await page.evaluate(() => {
              const items = [];
              document.querySelectorAll('img').forEach(img => {
                if (img.src && !img.src.includes('avatar') && !img.src.includes('profile') && (img.naturalWidth > 180 || img.width > 180)) {
                  let bestSrc = img.src;
                  if (img.srcset) {
                    const parts = img.srcset.split(',').map(p => {
                      const [u, w] = p.trim().split(/\s+/);
                      return { url: u, width: parseInt(w) || 0 };
                    }).sort((a, b) => b.width - a.width);
                    if (parts.length > 0 && parts[0].url) bestSrc = parts[0].url;
                  }
                  items.push({ type: 'image', url: bestSrc, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
                }
              });
              document.querySelectorAll('video').forEach(v => {
                const src = v.currentSrc || v.src || (v.querySelector('source') ? v.querySelector('source').src : '');
                if (src && !src.startsWith('blob:')) {
                  items.push({ type: 'video', url: src, poster: v.poster || '' });
                }
              });
              return items;
            });

            domMedia.forEach((dm, idx) => {
              const ext = inferExtension(dm.url, dm.type);
              collectedMedia.push({
                id: `post_${code}_${dm.type}_${idx}`,
                postId: code,
                code,
                postUrl: `https://www.threads.net/@${username}/post/${code}`,
                type: dm.type,
                url: dm.url,
                previewUrl: dm.url,
                width: dm.width || null,
                height: dm.height || null,
                resolution: dm.width && dm.height ? `${dm.width}x${dm.height}` : (dm.type === 'video' ? 'HD Video' : 'Original'),
                caption: '',
                takenAt: null,
                username,
                isCarousel: false,
                filename: sanitizeFilename(`${username}_${code}_${idx + 1}.${ext}`)
              });
            });

            collectedMedia = deduplicateMedia(collectedMedia);
            onProgress({
              type: 'scroll_progress',
              round: i + 1,
              maxRounds: postCodesToInspect.length,
              totalCount: collectedMedia.length,
              message: `Unpacked post #${i + 1}/${postCodesToInspect.length}: ${collectedMedia.length} total media files.`
            });
          } catch (postErr) {
            console.warn(`Post inspection notice for ${code}:`, postErr.message);
          }
        }
      }

      await this.browser.close();
      this.browser = null;

      // Final Deduplication and Summary
      collectedMedia = deduplicateMedia(collectedMedia);
      const imagesCount = collectedMedia.filter(m => m.type === 'image').length;
      const videosCount = collectedMedia.filter(m => m.type === 'video').length;
      const carouselsCount = collectedMedia.filter(m => m.isCarousel).length;

      const summary = {
        totalMedia: collectedMedia.length,
        imagesCount,
        videosCount,
        carouselsCount
      };

      onProgress({
        type: 'complete',
        profile: profileData,
        summary,
        totalCount: collectedMedia.length,
        message: `Scan complete! Collected ${collectedMedia.length} high-res media files (${imagesCount} images, ${videosCount} videos).`
      });

      return {
        username,
        profile: profileData,
        summary,
        media: collectedMedia
      };

    } catch (err) {
      if (this.browser) {
        try { await this.browser.close(); } catch (e) {}
        this.browser = null;
      }
      throw err;
    }
  }
}

module.exports = {
  ThreadsScraper,
  normalizeProfileInput,
  parseCookies
};
