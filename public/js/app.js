/**
 * Threads Media Downloader — Reactive Web Application Logic
 */

(function () {
  'use strict';

  // State
  let collectedMedia = [];
  let currentProfile = null;
  let activeFilter = 'all';
  let activeSessionId = null;
  let currentEventSource = null;
  let isScanning = false;

  const STORAGE_KEY_COOKIES = 'threads_user_cookies_v1';

  // DOM Elements
  const scanForm = document.getElementById('scanForm');
  const profileInput = document.getElementById('profileInput');
  const clearInputBtn = document.getElementById('clearInputBtn');
  const startScanBtn = document.getElementById('startScanBtn');
  const stopScanBtn = document.getElementById('stopScanBtn');

  // Status & Profile Card
  const statusSection = document.getElementById('statusSection');
  const profileSummary = document.getElementById('profileSummary');
  const profileAvatar = document.getElementById('profileAvatar');
  const profileAvatarFallback = document.getElementById('profileAvatarFallback');
  const profileDisplayName = document.getElementById('profileDisplayName');
  const profileUsername = document.getElementById('profileUsername');
  const profileBio = document.getElementById('profileBio');
  const scanStatusBadge = document.getElementById('scanStatusBadge');
  const progressBar = document.getElementById('progressBar');
  const statusMessage = document.getElementById('statusMessage');
  const scrollRoundInfo = document.getElementById('scrollRoundInfo');

  // Stats & Actions
  const toolbarSection = document.getElementById('toolbarSection');
  const statTotal = document.getElementById('statTotal');
  const statImages = document.getElementById('statImages');
  const statVideos = document.getElementById('statVideos');
  const statCarousels = document.getElementById('statCarousels');
  const statPills = document.querySelectorAll('.stat-pill');
  const downloadZipBtn = document.getElementById('downloadZipBtn');
  const zipBtnText = document.getElementById('zipBtnText');

  // Gallery
  const galleryEmptyState = document.getElementById('galleryEmptyState');
  const mediaGrid = document.getElementById('mediaGrid');

  // Lightbox
  const lightboxModal = document.getElementById('lightboxModal');
  const closeLightboxBtn = document.getElementById('closeLightboxBtn');
  const lightboxMediaContainer = document.getElementById('lightboxMediaContainer');
  const lightboxBadge = document.getElementById('lightboxBadge');
  const lightboxResolution = document.getElementById('lightboxResolution');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxDownloadBtn = document.getElementById('lightboxDownloadBtn');
  const lightboxPostLink = document.getElementById('lightboxPostLink');

  // Cookie Modal
  const cookieSettingsBtn = document.getElementById('cookieSettingsBtn');
  const cookieModal = document.getElementById('cookieModal');
  const closeCookieModalBtn = document.getElementById('closeCookieModalBtn');
  const cookieInputText = document.getElementById('cookieInputText');
  const saveCookiesBtn = document.getElementById('saveCookiesBtn');
  const clearCookiesBtn = document.getElementById('clearCookiesBtn');
  const currentCookieStatusText = document.getElementById('currentCookieStatusText');
  const cookieIndicator = document.getElementById('cookieIndicator');

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  // Quick Examples
  const examplePills = document.querySelectorAll('.example-pill');

  // Initialize
  function init() {
    setupEventListeners();
    updateCookieStatusUI();
  }

  function setupEventListeners() {
    // Search form submit
    scanForm.addEventListener('submit', handleFormSubmit);

    // Stop scan button
    stopScanBtn.addEventListener('click', stopActiveScan);

    // Input changes
    profileInput.addEventListener('input', () => {
      clearInputBtn.style.display = profileInput.value ? 'flex' : 'none';
    });

    clearInputBtn.addEventListener('click', () => {
      profileInput.value = '';
      clearInputBtn.style.display = 'none';
      profileInput.focus();
    });

    // Quick examples
    examplePills.forEach(pill => {
      pill.addEventListener('click', () => {
        const username = pill.getAttribute('data-profile');
        profileInput.value = username;
        clearInputBtn.style.display = 'flex';
        startScanning(username);
      });
    });

    // Filter pills
    statPills.forEach(pill => {
      pill.addEventListener('click', () => {
        statPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeFilter = pill.getAttribute('data-filter') || 'all';
        renderFilteredMedia();
      });
    });

    // Download ZIP
    downloadZipBtn.addEventListener('click', handleDownloadZip);

    // Lightbox modal close
    closeLightboxBtn.addEventListener('click', closeLightbox);
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });

    // Cookie settings modal
    cookieSettingsBtn.addEventListener('click', openCookieModal);
    const bannerCookieBtn = document.getElementById('bannerCookieBtn');
    if (bannerCookieBtn) {
      bannerCookieBtn.addEventListener('click', openCookieModal);
    }
    closeCookieModalBtn.addEventListener('click', closeCookieModal);
    cookieModal.addEventListener('click', (e) => {
      if (e.target === cookieModal) closeCookieModal();
    });

    saveCookiesBtn.addEventListener('click', handleSaveCookies);
    clearCookiesBtn.addEventListener('click', handleClearCookies);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
        closeCookieModal();
      }
    });
  }

  // --- Scan Operations ---

  function handleFormSubmit(e) {
    e.preventDefault();
    const query = profileInput.value.trim();
    if (!query) return;
    startScanning(query);
  }

  function startScanning(query) {
    if (isScanning) {
      stopActiveScan();
    }

    // Reset state
    collectedMedia = [];
    currentProfile = null;
    isScanning = true;
    activeSessionId = `session_${Date.now()}`;

    // UI Updates
    startScanBtn.style.display = 'none';
    stopScanBtn.style.display = 'inline-flex';
    statusSection.style.display = 'block';
    profileSummary.style.display = 'none';
    if (profileAvatar) {
      profileAvatar.src = '';
      profileAvatar.style.display = 'none';
    }
    if (profileAvatarFallback) {
      profileAvatarFallback.style.display = 'flex';
    }
    toolbarSection.style.display = 'block';
    galleryEmptyState.style.display = 'none';
    mediaGrid.style.display = 'grid';
    mediaGrid.innerHTML = '';

    progressBar.style.width = '10%';
    scanStatusBadge.textContent = 'Scanning...';
    statusMessage.textContent = 'Launching browser and connecting...';
    scrollRoundInfo.textContent = '';
    updateStatsCounters();

    // Get optional cookies
    const storedCookies = localStorage.getItem(STORAGE_KEY_COOKIES) || '';

    // Build SSE URL
    const sseUrl = new URL('/api/scan', window.location.origin);
    sseUrl.searchParams.set('profile', query);
    sseUrl.searchParams.set('sessionId', activeSessionId);
    if (storedCookies) {
      sseUrl.searchParams.set('cookies', storedCookies);
    }

    currentEventSource = new EventSource(sseUrl.toString());

    currentEventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      statusMessage.textContent = data.message || 'Processing...';
      if (data.stage === 'init') progressBar.style.width = '15%';
      if (data.stage === 'loading_profile') progressBar.style.width = '30%';
      if (data.stage === 'media_tab') progressBar.style.width = '45%';
      if (data.stage === 'scrolling') progressBar.style.width = '60%';
      if (data.stage === 'bottom') progressBar.style.width = '95%';
    });

    currentEventSource.addEventListener('profile_info', (e) => {
      const data = JSON.parse(e.data);
      if (data.profile) {
        currentProfile = data.profile;
        renderProfileSummary(data.profile);
      }
    });

    currentEventSource.addEventListener('media_batch', (e) => {
      const data = JSON.parse(e.data);
      if (Array.isArray(data.items) && data.items.length > 0) {
        addMediaItems(data.items);
      }
    });

    currentEventSource.addEventListener('scroll_progress', (e) => {
      const data = JSON.parse(e.data);
      const progressPercent = Math.min(95, 45 + Math.round((data.round / data.maxRounds) * 50));
      progressBar.style.width = `${progressPercent}%`;
      scrollRoundInfo.textContent = `Page ${data.round} / ${data.maxRounds}`;
    });

    currentEventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      finishScan(data.message || 'Scanning completed successfully.');
    });

    currentEventSource.addEventListener('error', (e) => {
      let msg = 'Connection terminated or scan ended.';
      try {
        if (e.data) {
          const parsed = JSON.parse(e.data);
          msg = parsed.message || msg;
        }
      } catch (err) {}
      finishScan(msg, true);
    });

    currentEventSource.onerror = () => {
      if (isScanning) {
        finishScan('Scan completed or session closed.');
      }
    };
  }

  function stopActiveScan() {
    if (!isScanning) return;
    if (activeSessionId) {
      fetch('/api/scan/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId })
      }).catch(() => {});
    }
    finishScan('Scan stopped by user.');
  }

  function finishScan(message, isError = false) {
    isScanning = false;
    if (currentEventSource) {
      currentEventSource.close();
      currentEventSource = null;
    }

    startScanBtn.style.display = 'inline-flex';
    stopScanBtn.style.display = 'none';
    progressBar.style.width = '100%';
    scanStatusBadge.textContent = isError ? 'Ended' : 'Completed';
    const storedCookies = localStorage.getItem(STORAGE_KEY_COOKIES) || '';
    if (!isError && !storedCookies && collectedMedia.length > 0) {
      statusMessage.textContent = `${message} — Tip: Add cookies 🍪 to download 1000+ historical posts.`;
    } else {
      statusMessage.textContent = message;
    }

    if (isError) {
      showToast(message, 'error');
    } else {
      showToast(message, 'success');
    }

    if (collectedMedia.length === 0) {
      galleryEmptyState.style.display = 'block';
      mediaGrid.style.display = 'none';
    }
  }

  // --- Profile Card Rendering ---

  function renderProfileSummary(profile) {
    if (!profile) return;
    profileSummary.style.display = 'flex';

    if (profile.avatarUrl) {
      // Use local server image proxy to guarantee 100% bypass of CORS, Referrer, and adblocker issues
      const proxiedUrl = `/api/proxy-image?url=${encodeURIComponent(profile.avatarUrl)}`;
      profileAvatar.src = proxiedUrl;
      profileAvatar.style.display = 'block';
      if (profileAvatarFallback) profileAvatarFallback.style.display = 'none';

      profileAvatar.onload = () => {
        profileAvatar.style.display = 'block';
        if (profileAvatarFallback) profileAvatarFallback.style.display = 'none';
      };

      profileAvatar.onerror = () => {
        // Fallback to direct URL if proxy had any issue
        if (profileAvatar.src !== profile.avatarUrl) {
          profileAvatar.src = profile.avatarUrl;
        } else {
          // If both fail, gracefully show clean SVG fallback avatar
          profileAvatar.style.display = 'none';
          if (profileAvatarFallback) profileAvatarFallback.style.display = 'flex';
        }
      };
    } else {
      profileAvatar.style.display = 'none';
      if (profileAvatarFallback) profileAvatarFallback.style.display = 'flex';
    }

    profileDisplayName.textContent = profile.displayName || profile.username;
    profileUsername.textContent = `@${profile.username}`;
    profileBio.textContent = profile.bio || '';
  }

  // --- Media Items & Gallery ---

  function addMediaItems(newItems) {
    const existingIds = new Set(collectedMedia.map(m => m.id));
    const toAdd = [];

    newItems.forEach(item => {
      if (!existingIds.has(item.id)) {
        collectedMedia.push(item);
        existingIds.add(item.id);
        toAdd.push(item);
      }
    });

    if (toAdd.length > 0) {
      updateStatsCounters();
      renderNewCards(toAdd);
    }
  }

  function updateStatsCounters() {
    const total = collectedMedia.length;
    const images = collectedMedia.filter(m => m.type === 'image').length;
    const videos = collectedMedia.filter(m => m.type === 'video').length;
    const carousels = collectedMedia.filter(m => m.isCarousel).length;

    statTotal.textContent = total;
    statImages.textContent = images;
    statVideos.textContent = videos;
    statCarousels.textContent = carousels;

    if (total > 0) {
      downloadZipBtn.disabled = false;
      zipBtnText.textContent = `Download All (${total} files)`;
    } else {
      downloadZipBtn.disabled = true;
      zipBtnText.textContent = 'Download All (ZIP)';
    }
  }

  function renderNewCards(items) {
    const fragment = document.createDocumentFragment();

    items.forEach(item => {
      // Check filter
      if (activeFilter === 'image' && item.type !== 'image') return;
      if (activeFilter === 'video' && item.type !== 'video') return;
      if (activeFilter === 'carousel' && !item.isCarousel) return;

      const card = createMediaCard(item);
      fragment.appendChild(card);
    });

    mediaGrid.appendChild(fragment);
  }

  function renderFilteredMedia() {
    mediaGrid.innerHTML = '';
    const filtered = collectedMedia.filter(item => {
      if (activeFilter === 'image') return item.type === 'image';
      if (activeFilter === 'video') return item.type === 'video';
      if (activeFilter === 'carousel') return item.isCarousel;
      return true;
    });

    if (filtered.length === 0 && collectedMedia.length > 0) {
      mediaGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No media matches the "${activeFilter}" filter.</div>`;
      return;
    }

    renderNewCards(filtered);
  }

  function createMediaCard(item) {
    const card = document.createElement('div');
    card.className = 'media-card';
    card.setAttribute('data-id', item.id);

    // Badge styling
    let badgeClass = 'card-badge';
    let badgeText = item.type === 'video' ? 'Video' : 'Image';
    if (item.isCarousel) {
      badgeClass += ' badge-carousel';
      badgeText = `Carousel #${item.carouselIndex || 1}`;
    } else if (item.type === 'video') {
      badgeClass += ' badge-video';
    }

    // Media element
    let mediaMarkup = '';
    if (item.type === 'video') {
      mediaMarkup = `
        <video src="${escapeHtml(item.url)}" poster="${escapeHtml(item.previewUrl || '')}" preload="metadata" muted playsinline loop></video>
      `;
    } else {
      mediaMarkup = `
        <img src="${escapeHtml(item.previewUrl || item.url)}" alt="${escapeHtml(item.caption || 'Threads photo')}" loading="lazy">
      `;
    }

    const downloadUrl = `/api/download-single?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename)}`;

    card.innerHTML = `
      <div class="card-media-wrapper">
        <span class="${badgeClass}">${badgeText}</span>
        <span class="card-res">${escapeHtml(item.resolution || 'Original')}</span>
        ${mediaMarkup}
      </div>
      <div class="card-footer">
        <div class="card-info">
          <span class="card-filename" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</span>
          <span class="card-caption" title="${escapeHtml(item.caption || '')}">${escapeHtml(item.caption || 'No caption')}</span>
        </div>
        <a href="${downloadUrl}" class="card-download-btn" title="Download High-Res file">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Save</span>
        </a>
      </div>
    `;

    // Click on media thumbnail opens lightbox
    const mediaWrapper = card.querySelector('.card-media-wrapper');
    mediaWrapper.addEventListener('click', () => openLightbox(item));

    // Video hover to play preview
    if (item.type === 'video') {
      const vid = card.querySelector('video');
      card.addEventListener('mouseenter', () => {
        vid.play().catch(() => {});
      });
      card.addEventListener('mouseleave', () => {
        vid.pause();
        vid.currentTime = 0;
      });
    }

    return card;
  }

  // --- Lightbox Operations ---

  function openLightbox(item) {
    lightboxMediaContainer.innerHTML = '';

    if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = item.url;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      lightboxMediaContainer.appendChild(video);
      lightboxBadge.textContent = 'Video';
      lightboxBadge.className = 'card-badge badge-video';
    } else {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = item.caption || 'Threads High-Res Photo';
      lightboxMediaContainer.appendChild(img);
      lightboxBadge.textContent = item.isCarousel ? `Carousel #${item.carouselIndex || 1}` : 'Photo';
      lightboxBadge.className = item.isCarousel ? 'card-badge badge-carousel' : 'card-badge';
    }

    lightboxResolution.textContent = item.resolution || 'Original Resolution';
    lightboxCaption.textContent = item.caption || 'No caption attached to this post.';

    // Setup direct download button
    const downloadUrl = `/api/download-single?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename)}`;
    lightboxDownloadBtn.href = downloadUrl;

    // View post link
    if (item.postUrl) {
      lightboxPostLink.href = item.postUrl;
      lightboxPostLink.style.display = 'inline-flex';
    } else {
      lightboxPostLink.style.display = 'none';
    }

    lightboxModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightboxModal.style.display = 'none';
    lightboxMediaContainer.innerHTML = '';
    document.body.style.overflow = '';
  }

  // --- ZIP Bulk Download ---

  async function handleDownloadZip() {
    if (collectedMedia.length === 0) return;

    // Strictly username (nothing else)
    const username = currentProfile && currentProfile.username ? currentProfile.username : 'threads_user';
    showToast(`Generating ${username}.zip (${collectedMedia.length} files)... Download will begin shortly.`, 'info');

    downloadZipBtn.disabled = true;
    const originalBtnText = zipBtnText.textContent;
    zipBtnText.textContent = 'Packaging ZIP...';

    // 1. Direct native download via GET: 0 payload, uses server-cached scan results
    const getUrl = `/api/download-zip?sessionId=${encodeURIComponent(activeSessionId || '')}&username=${encodeURIComponent(username)}`;

    try {
      // Trigger native browser download directly via anchor
      const a = document.createElement('a');
      a.href = getUrl;
      a.download = `${username}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      showToast(`ZIP packaging initiated for ${username}.zip!`, 'success');
    } catch (err) {
      console.warn('Native GET download trigger warning, attempting lightweight POST fallback:', err);
      // Fallback: If GET trigger had any issue, send ultra-lightweight payload (only url & filename, no captions/previews)
      try {
        const lightweightItems = collectedMedia.map(m => ({ url: m.url, filename: m.filename }));
        const res = await fetch('/api/download-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeSessionId,
            profileName: username,
            items: lightweightItems
          })
        });

        if (!res.ok) throw new Error(`Server returned status ${res.status}`);

        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${username}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);

        showToast(`Downloaded ${username}.zip successfully!`, 'success');
      } catch (fallbackErr) {
        console.error('ZIP download error:', fallbackErr);
        showToast('Failed to generate ZIP: ' + fallbackErr.message, 'error');
      }
    } finally {
      setTimeout(() => {
        downloadZipBtn.disabled = false;
        zipBtnText.textContent = originalBtnText;
      }, 3000);
    }
  }

  // --- Cookie Modal Operations ---

  function openCookieModal() {
    const existing = localStorage.getItem(STORAGE_KEY_COOKIES) || '';
    cookieInputText.value = existing;
    updateCookieStatusUI();
    cookieModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeCookieModal() {
    cookieModal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function handleSaveCookies() {
    const val = cookieInputText.value.trim();
    if (val) {
      localStorage.setItem(STORAGE_KEY_COOKIES, val);
      showToast('Threads session cookies saved locally.', 'success');
    } else {
      localStorage.removeItem(STORAGE_KEY_COOKIES);
      showToast('Cleared cookies.', 'info');
    }
    updateCookieStatusUI();
    closeCookieModal();
  }

  function handleClearCookies() {
    localStorage.removeItem(STORAGE_KEY_COOKIES);
    cookieInputText.value = '';
    updateCookieStatusUI();
    showToast('Cookies removed.', 'info');
    closeCookieModal();
  }

  function updateCookieStatusUI() {
    const stored = localStorage.getItem(STORAGE_KEY_COOKIES);
    if (stored && stored.trim()) {
      cookieIndicator.classList.add('active');
      cookieIndicator.title = 'Cookies configured (Authenticated scan enabled)';
      currentCookieStatusText.textContent = 'Active: Session cookies will be applied for high-accuracy authenticated scanning.';
      currentCookieStatusText.style.color = 'var(--success)';
    } else {
      cookieIndicator.classList.remove('active');
      cookieIndicator.title = 'No cookies configured (Standard scan)';
      currentCookieStatusText.textContent = 'No cookies configured. Using standard anonymous scanner.';
      currentCookieStatusText.style.color = 'var(--text-muted)';
    }
  }

  // --- Toast System ---

  function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --- Helper Functions ---

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Run init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
