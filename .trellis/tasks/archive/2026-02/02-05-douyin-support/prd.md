# Add Douyin Video Download Support

## Background

FlowSelect browser extension currently supports Twitter/X video detection. Users need similar support for Douyin (Chinese TikTok) to download videos directly from the website.

## Goals

1. Add Douyin content script to detect videos on douyin.com
2. Extract video URLs directly from page (not via yt-dlp)
3. Download videos using direct URL fetch

## Phase 1: Initial Implementation (DONE)

### Completed Work

- Created `browser-extension/douyin-detector.js` - Video URL extraction from DOM
- Created `browser-extension/douyin-button.css` - Button styles
- Updated `browser-extension/manifest.json` - Added Douyin content script
- Added `download_douyin_direct()` in `lib.rs` - Direct video download
- Added `is_douyin_url()` - URL detection for Douyin/douyinvod.com

### Implementation Notes

- yt-dlp has limitations with Douyin, implemented direct download instead
- Extract video URL from `<video source>` element (RENDER_DATA is null on SPA)
- Added documentation: `.trellis/spec/guides/video-download-patterns.md`

## Phase 2: Direct Download Implementation (TODO)

Based on analysis of AixDownloader extension, need to implement direct video URL extraction.

### Architecture (AixDownloader Approach)

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Extension                         │
├─────────────────────────────────────────────────────────────┤
│  1. douyin-interceptor.js (inject into page)                │
│     - Intercept XHR/Fetch API calls                         │
│     - Capture /aweme/v1/web/aweme/detail/ responses         │
│     - Extract awemeInfo from API response                   │
│     - Post video data to content script                     │
│                                                             │
│  2. douyin-detector.js (content script)                     │
│     - Listen for intercepted data                           │
│     - Extract video URL from awemeInfo.video.playApi        │
│     - Or extract from React Fiber: __reactFiber$            │
│     - Send direct video URL to background.js                │
│                                                             │
│  3. background.js                                           │
│     - Receive video URL (not page URL)                      │
│     - Send to Tauri app via WebSocket                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Backend                             │
├─────────────────────────────────────────────────────────────┤
│  - Receive direct video URL                                 │
│  - Download using reqwest (not yt-dlp)                      │
│  - Set proper headers: Referer, Origin                      │
│  - Save to download folder                                  │
└─────────────────────────────────────────────────────────────┘
```

### Key API Paths to Intercept

```javascript
apiPaths = {
  "/aweme/v1/web/aweme/detail/": "detail",      // Single video
  "/aweme/v1/web/module/feed/": "discover",     // Discover feed
  "/aweme/v1/web/aweme/post/": "recommend",     // Recommendations
  "/aweme/v1/web/user/profile/other/": "user",  // User profile
}
```

### Video Data Structure

```javascript
awemeInfo = {
  awemeId: "7602878785481968915",
  video: {
    playApi: "https://www.douyin.com/aweme/v1/play/...",
    bitRateList: [
      { playApi: "...", width: 1080, height: 1920, dataSize: 12345678 },
      { playApi: "...", width: 720, height: 1280, dataSize: 8765432 },
    ],
    cover: "https://...",
  },
  music: {
    playUrl: { uri: "https://..." }
  },
  desc: "Video description",
  authorInfo: { nickname: "Author Name" }
}
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `browser-extension/douyin-interceptor.js` | Create | XHR/Fetch interceptor |
| `browser-extension/douyin-detector.js` | Modify | Add data extraction logic |
| `browser-extension/manifest.json` | Modify | Add interceptor as web_accessible_resource |
| `src-tauri/src/lib.rs` | Modify | Add direct download handler |

## Technical Notes

### Why Not yt-dlp?

1. yt-dlp Douyin extractor requires special cookies handling
2. Douyin has aggressive anti-scraping measures
3. Direct URL extraction is more reliable and faster

### Download Headers Required

```
Referer: https://www.douyin.com/
Origin: https://www.douyin.com
User-Agent: Mozilla/5.0 ...
```

### SSR Data Extraction (Fallback)

If API interception fails, extract from page:
```javascript
// Script tag
document.querySelector("#RENDER_DATA")

// Window globals
window.__INIT_PROPS__
window.__INITIAL_STATE__
```

## Session Log

### Session 1 (2026-02-05)

**Work Done:**
- Created basic douyin-detector.js and douyin-button.css
- Updated manifest.json with Douyin content script
- Fixed Netscape cookie format in background.js

**Issues Found:**
- yt-dlp Douyin extractor broken (anti-scraping)
- Need to implement direct URL extraction like AixDownloader

**Next Steps:**
- Implement Phase 2: Direct download without yt-dlp

### Session 2 (2026-02-05)

**Work Done:**
- Implemented direct download via `<video source>` element extraction
- Added `download_douyin_direct()` function in Rust backend
- Video download working successfully

**Issues Found:**
1. `videoKeepOriginalName` setting not working for Douyin videos
2. Videos save with sequence number (e.g., `83.mp4`) instead of original title
3. Need to extract video title from page for original filename

**Next Steps:**
- Fix `videoKeepOriginalName` support for Douyin
- Extract video title from page DOM or RENDER_DATA
- Pass title to backend for filename

### Session 3 (2026-02-05)

**Work Done:**
- Added `title` parameter to `download_douyin_direct()` function
- Implemented `videoKeepOriginalName` setting check for Douyin downloads
- Modified WebSocket handler to extract and pass `title` from extension message
- Added `extractVideoTitle()` function in douyin-detector.js for better title extraction
- Title cleaning: removes " - 抖音" suffix, invalid filename chars, limits to 100 chars

**Files Modified:**
- `src-tauri/src/lib.rs`: Function signature + filename logic + WebSocket handler
- `browser-extension/douyin-detector.js`: Added extractVideoTitle() function

**Status:**
- All checks passed (cargo check, typecheck, lint)
- Ready for testing
