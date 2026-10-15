# Threads Media Downloader — Standalone Web Application

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)  
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A standalone web application to scan, preview, and download high-resolution photos, carousels, and videos from any Threads profile individually or as a single neatly named ZIP archive.

---

## ✨ Features

- **Profile-Based Scanning**: Enter any Threads profile URL (`threads.net/@user`), handle (`@user`), or username (`user`).
- **Complete Media Collection**:
  - Automatically navigates profile feeds and dedicated `/media` tabs.
  - Automatically bypasses login popups for continuous scrolling down `div#scrollview`.
  - Unpacks multi-slide carousels into individual high-resolution items.
- **Highest Available Resolution**:
  - Extracts full 4K / UHD original image candidates (`candidates` reduction to max dimensions).
  - Extracts 1280p progressive MP4 videos directly from Meta CDNs.
- **Dynamic Live Gallery**:
  - Real-time media streaming via Server-Sent Events (SSE) — media cards appear in real time as scanning progresses.
  - Interactive video previews with hover playback.
  - Fullscreen Lightbox modal with zoom, caption display, and direct post link.
  - Filter pills for `All`, `Images`, `Videos`, and `Carousels`.
- **Individual & Bulk ZIP Downloads**:
  - Download any image or video individually with a single click.
  - Download all collected media in a single ZIP file (`profile_name_media.zip`) streamed directly without memory overload.
  - Preserves original usernames and Unicode characters while safely sanitizing OS-restricted characters (`<>:"/\|?*`).
- **Optional Threads Session Cookies**:
  - Clean cookie modal with complete local-only privacy reassurance.
  - Supports standard header string (`sessionid=...; ds_user_id=...`) and JSON array formats.
  - Enables authenticated scanning for deeper pagination and private profiles you have access to.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Web Server

```bash
npm start
```

### 3. Open in Browser

Visit **`http://localhost:3000`** in your browser.

---

## 🗂️ Project Structure

```
Threads-Media-Downloader/
├── lib/
│   ├── scraper.js          # Puppeteer intelligent scraper, network interceptor, and scrolling engine
│   ├── media-extractor.js  # Candidate resolution optimizer, carousel unpacker, and filename sanitizer
│   └── zip-builder.js      # Streaming ZIP generator using JSZip
├── public/
│   ├── index.html          # Semantic HTML5 interface with dark mode and glassmorphism
│   ├── css/
│   │   └── style.css       # Vanilla CSS design system with micro-animations and responsive grid
│   └── js/
│       └── app.js          # Reactive frontend controller (SSE streams, gallery, lightbox, cookies)
├── server.js               # Express HTTP & SSE API server
├── test_e2e_scan.js        # Automated end-to-end integration test
└── package.json            # Project manifest and start script
```

---

## 🔒 Optional Cookie Privacy Notice

Session cookies are stored **only locally in your browser/machine** and are never transmitted to third parties, logged to disk, or included in exports. Standard unauthenticated scans work out of the box.

---

## 📜 License

MIT License. For personal archival and educational purposes.
