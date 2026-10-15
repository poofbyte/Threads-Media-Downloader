/**
 * Threads Media Extractor
 * Extracts maximum resolution media, cleans filenames, and handles carousels
 */

/**
 * Sanitize filename preserving valid characters and unicode
 * Only removes invalid filesystem characters (<>:"/\|?* and control characters)
 */
function sanitizeFilename(name, fallback = 'media') {
  if (!name || typeof name !== 'string') return fallback;
  // Replace invalid filesystem characters on Windows/Linux/macOS with an underscore
  let clean = name.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_').trim();
  // Remove leading/trailing dots or spaces (Windows restriction)
  clean = clean.replace(/^[.\s]+|[.\s]+$/g, '');
  return clean || fallback;
}

/**
 * Format timestamp into ISO-like readable date string
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'unknown_date';
  const d = new Date(typeof timestamp === 'number' && timestamp < 1e11 ? timestamp * 1000 : timestamp);
  if (isNaN(d.getTime())) return 'unknown_date';
  
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `${y}-${m}-${day}_${h}-${min}-${s}Z`;
}

/**
 * Pick highest resolution image from candidates
 */
function getBestImageCandidate(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  return candidates.reduce((best, curr) => {
    if (!curr || !curr.url) return best;
    if (!best) return curr;
    const bestArea = (best.width || 0) * (best.height || 0);
    const currArea = (curr.width || 0) * (curr.height || 0);
    return currArea > bestArea ? curr : best;
  }, null);
}

/**
 * Pick highest quality video from video_versions
 */
function getBestVideoVersion(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return null;
  // Usually the first entry or the one with highest resolution / bitrate
  return versions.reduce((best, curr) => {
    if (!curr || !curr.url) return best;
    if (!best) return curr;
    const bestArea = (best.width || 0) * (best.height || 0);
    const currArea = (curr.width || 0) * (curr.height || 0);
    return currArea > bestArea ? curr : best;
  }, versions[0]);
}

/**
 * Infer extension from URL or mime type
 */
function inferExtension(url, type = 'image') {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    if (match) {
      const ext = match[1].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
  } catch (e) {}
  return type === 'video' ? 'mp4' : 'jpg';
}

/**
 * Extract normalized media items from a single post object (from JSON/GraphQL)
 */
function extractMediaFromPost(post, fallbackUsername = 'threads_user') {
  if (!post || !post.pk) return [];
  
  const results = [];
  const username = sanitizeFilename(post.user?.username || fallbackUsername, 'threads_user');
  const code = post.code || '';
  const postId = String(post.pk);
  const dateStr = formatTimestamp(post.taken_at);
  const caption = post.caption?.text || '';

  // Helper to construct normalized item
  const buildItem = (rawItem, index, isCarousel = false) => {
    let type = 'image';
    let mediaUrl = null;
    let previewUrl = null;
    let width = null;
    let height = null;

    // Check for video first
    if (Array.isArray(rawItem.video_versions) && rawItem.video_versions.length > 0) {
      type = 'video';
      const bestVid = getBestVideoVersion(rawItem.video_versions);
      if (bestVid) {
        mediaUrl = bestVid.url;
        width = bestVid.width || rawItem.original_width || null;
        height = bestVid.height || rawItem.original_height || null;
      }
      const posterCandidate = getBestImageCandidate(rawItem.image_versions2?.candidates);
      previewUrl = posterCandidate?.url || null;
    } else if (rawItem.image_versions2?.candidates?.length) {
      type = 'image';
      const bestImg = getBestImageCandidate(rawItem.image_versions2.candidates);
      if (bestImg) {
        mediaUrl = bestImg.url;
        width = bestImg.width || rawItem.original_width || null;
        height = bestImg.height || rawItem.original_height || null;
        previewUrl = bestImg.url;
      }
    }

    if (!mediaUrl) return null;

    const ext = inferExtension(mediaUrl, type);
    const mediaPk = rawItem.pk || rawItem.id || `${postId}_${index}`;
    const filename = `${username}_${dateStr}_${postId}_${isCarousel ? `carousel_${index + 1}` : 'media'}.${ext}`;

    return {
      id: `${postId}_${mediaPk}_${index}`,
      postId,
      mediaPk: String(mediaPk),
      code,
      postUrl: code ? `https://www.threads.net/@${username}/post/${code}` : null,
      type,
      url: mediaUrl,
      previewUrl: previewUrl || mediaUrl,
      width,
      height,
      resolution: width && height ? `${width}x${height}` : (type === 'video' ? 'HD Video' : 'Original'),
      caption,
      takenAt: post.taken_at ? post.taken_at * 1000 : null,
      username,
      isCarousel,
      carouselIndex: isCarousel ? index + 1 : null,
      filename: sanitizeFilename(filename, `threads_${postId}.${ext}`)
    };
  };

  // 1. Check if post is a carousel
  if (Array.isArray(post.carousel_media) && post.carousel_media.length > 0) {
    post.carousel_media.forEach((item, idx) => {
      const extracted = buildItem(item, idx, true);
      if (extracted) results.push(extracted);
    });
  } else {
    // 2. Single item (image or video)
    const single = buildItem(post, 0, false);
    if (single) results.push(single);
  }

  // 3. Check for linked inline media
  if (post.text_post_app_info?.linked_inline_media) {
    const inline = buildItem(post.text_post_app_info.linked_inline_media, results.length, false);
    if (inline) results.push(inline);
  }

  return results;
}

/**
 * Filter and deduplicate media items
 */
function deduplicateMedia(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item || !item.url) return false;
    // Extract base URL without dynamic token if possible
    let key = item.id;
    try {
      const u = new URL(item.url);
      key = `${item.type}:${u.pathname}`;
    } catch (e) {
      key = `${item.type}:${item.url}`;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  sanitizeFilename,
  formatTimestamp,
  getBestImageCandidate,
  getBestVideoVersion,
  inferExtension,
  extractMediaFromPost,
  deduplicateMedia
};
