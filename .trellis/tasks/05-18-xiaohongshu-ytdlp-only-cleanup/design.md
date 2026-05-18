# Design: Xiaohongshu yt-dlp-only video cleanup

## 1. Scope / Trigger

This task removes the Xiaohongshu-specific direct-video extraction path now that yt-dlp can reliably download Xiaohongshu notes from canonical page URLs.

In scope:

- Xiaohongshu video routing and payload normalization.
- Xiaohongshu direct-video candidate extraction in extension and Electron runtime paths.
- Tests and specs that currently encode direct xhscdn video fallback behavior.

Out of scope:

- Removing Xiaohongshu image save/drag behavior.
- Removing generic direct download support for other sites.
- Changing site session cookie capture.

## 2. Signatures

No public command names are removed in this task.

Commands that must remain available:

- `video_selected_v2`
- `queue_video_download`
- `queue_pasted_video_download`
- `resolve_xiaohongshu_drag_media`
- `save_image_from_page`

The behavior of Xiaohongshu video payloads changes:

```ts
// Before, Xiaohongshu video payloads could include direct video hints.
{
  type: "video_selection",
  url: "https://sns-video-*.xhscdn.com/...",
  pageUrl: "https://www.xiaohongshu.com/explore/<noteId>",
  videoUrl: "https://sns-video-*.xhscdn.com/...",
  videoCandidates: [...]
}

// After, Xiaohongshu video payloads should prefer a yt-dlp-valid note URL.
{
  type: "video_selection",
  url: "https://www.xiaohongshu.com/explore/<hexId>",
  pageUrl: "https://www.xiaohongshu.com/explore/<hexId>",
  siteHint: "xiaohongshu",
  selectionScope: "current_item"
}
```

## 3. Contracts

### Provider contract

- `src/sites/xiaohongshu.ts` should match Xiaohongshu page URLs, `xhslink.com` URLs, or explicit `siteHint: "xiaohongshu"`.
- Bare `xhscdn.com` video assets should not force the Xiaohongshu provider. If such a URL enters the queue without a page URL or site hint, the generic yt-dlp provider can handle it.
- Xiaohongshu provider engine plan remains `yt-dlp` only.
- The yt-dlp source must match yt-dlp's Xiaohongshu extractor shape: `https://www.xiaohongshu.com/explore/<hexId>` or `https://www.xiaohongshu.com/discovery/item/<hexId>` with optional query parameters.
- If a tokenized `detailUrl` already matches `discovery/item/<hexId>?xsec_token=...`, prefer it as the yt-dlp source because yt-dlp's extractor tests cover that shape.
- If the input is a profile-note URL, normalize it to `https://www.xiaohongshu.com/explore/<hexId>` before provider planning.

### Extension contract

- Xiaohongshu detector can keep image URL discovery.
- Xiaohongshu detector should not scan for direct video candidates just to build `videoCandidates` for download.
- Download button and pasted selection should enqueue a yt-dlp-valid note URL for video, not arbitrary profile, CDN, or site-root URLs.
- Image-only notes should continue to send `save_image_from_page` with a resolved image URL.

### Runtime contract

- `src/electron-runtime/service.ts` should not call Xiaohongshu page-hint probing before provider resolution.
- `src/electron-runtime/xiaohongshuPageHints.ts` should be reduced to image/drag helpers that remain necessary, or removed if no longer referenced after direct-video cleanup.
- `electron/main.mts` should keep Xiaohongshu image/drag resolution only where it is still used for image saving. Hidden detail probing that exists only to recover video direct URLs should be removed.

## 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Xiaohongshu note URL | Resolve provider `xiaohongshu`; engine list is `["yt-dlp"]`; source URL matches yt-dlp `_VALID_URL` |
| Xiaohongshu profile-note URL | Canonicalize to `/explore/<noteId>` for yt-dlp |
| Tokenized `discovery/item` detail URL | Prefer it as the yt-dlp source and preserve `xsec_token` |
| Xiaohongshu short link | Existing short-link expansion runs before provider resolution; resulting page URL routes to yt-dlp |
| Bare `xhscdn.com/*.mp4` URL without page URL | Do not use Xiaohongshu provider solely because of the CDN host |
| Xiaohongshu image note from extension | Continue image save path via `save_image_from_page` |
| Xiaohongshu video note from extension | Send note/page URL to video queue without direct candidates |

## 5. Good / Base / Bad Cases

- Good: A Xiaohongshu video page queues `https://www.xiaohongshu.com/explore/<hexId>` or a tokenized `discovery/item/<hexId>` URL and yt-dlp handles extraction.
- Good: A Xiaohongshu image note still saves the image through the existing image path.
- Base: A direct CDN URL pasted into the app is treated as a generic URL rather than a special Xiaohongshu recovery path.
- Bad: The extension reintroduces script/performance scanning to produce Xiaohongshu `videoCandidates`.
- Bad: Runtime queue execution fetches Xiaohongshu HTML/API pages before yt-dlp provider resolution to discover direct video URLs.

## 6. Tests Required

- `src/sites/providers.test.ts`: Xiaohongshu cases assert yt-dlp source is canonical note URL and direct candidates are not required.
- `src/electron-runtime/service.test.ts`: remove or rewrite tests that expect Xiaohongshu page hint probing before queue execution.
- `src/electron-runtime/xiaohongshuPageHints.test.ts`: keep only tests for retained image/drag helpers, or delete when the module is removed.
- Browser extension JS syntax checks for touched files with `node --check`.
- Full checks: `npm run type-check`, `npm run lint`, focused Vitest suites.

## 7. Wrong vs Correct

### Wrong

```ts
const candidates = extractVideoCandidates();
chrome.runtime.sendMessage({
  type: "video_selection",
  url: candidates[0]?.url ?? pageUrl,
  videoCandidates: candidates,
});
```

### Correct

```ts
chrome.runtime.sendMessage({
  type: "video_selection",
  url: ytdlpValidNoteUrl,
  pageUrl: ytdlpValidNoteUrl,
  siteHint: "xiaohongshu",
  selectionScope: "current_item",
});
```
