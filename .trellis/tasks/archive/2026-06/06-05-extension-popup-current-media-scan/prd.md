# Fix extension popup current media scan

## Goal

Make the browser extension popup show the media users actually intend to download from the current page, without mixing in unrelated page links or misleading shared thumbnails.

The popup media list currently behaves like a broad page-resource scanner. On pages such as Bilibili and YouTube, the actual player stream is often `blob:` / MSE-backed and cannot be surfaced as a direct HTTP video element URL. The generic scanner then falls back to unrelated page links whose URLs merely contain words such as `video`, `play`, or `media`, so recommendation cards, search links, creator-center links, and other navigation items appear as video resources.

The same scan path also assigns page-level `og:image` as the preview for many link candidates, so unrelated resources can all show the same cover image.

## Requirements

- Treat "current media" and "page links/resources" as separate concepts. The popup video tab must prioritize the current primary media item over broad page link discovery.
- For YouTube and Bilibili watch/play pages, the popup must prefer the current canonical content URL and page title instead of recommendation, search, navigation, or creator-center links.
- For Pinterest-style sites, do not replace site-specific scoped media extraction with a blanket current-page URL fallback. Pin detail pages and scoped Pin/card interactions must continue to use real candidate URLs and metadata when available.
- Generic link scanning must no longer classify ordinary page links as video resources just because the URL contains broad words such as `video`, `play`, `stream`, `media`, or `playlist`.
- Direct media URLs (`.mp4`, `.webm`, `.m3u8`, `.mpd`, etc.) may remain candidates, but they must be clearly lower priority than a high-confidence current item unless they are produced by a site-specific scoped resolver.
- Candidate preview images must come from the candidate itself or its local DOM scope when possible: video poster, nearby thumbnail image, scoped card image, or site-specific metadata. Page-level `og:image` may only be used as a fallback for a current-page/current-item candidate, not as the default cover for every unrelated link.
- If a direct link candidate has no scoped preview, it may be shown without a preview. A missing preview is preferable to reusing an unrelated page-level cover across multiple rows.
- Preserve existing direct download and selection flows. This task changes popup discovery accuracy, not desktop download execution.
- Add regression tests covering current-item prioritization, noisy link filtering, Pinterest/scoped extraction preservation, and candidate-level preview behavior.

## Acceptance Criteria

- [ ] On a YouTube watch page, the popup video tab shows the current video/current page candidate and does not list recommendation links as current videos.
- [ ] On a Bilibili video or bangumi play page, the popup video tab shows the current video/current page candidate and does not list `search.bilibili.com`, `member.bilibili.com`, or navigation/recommendation links as current videos.
- [ ] On Pinterest Pin/detail scenarios with site-specific media candidates, real Pin video candidates remain preferred over a generic current-page fallback.
- [ ] Multiple link/media candidates no longer all receive the same page-level `og:image` cover unless that image is genuinely the scoped fallback for a single current-page candidate.
- [ ] Ordinary page links containing broad media words are not classified as video resources by the generic popup scanner.
- [ ] Existing extension tests pass, with new focused tests for the above behavior.

## Notes

- This is separate from `.trellis/tasks/06-05-return-proxy-ownership-to-user-tools`, which has already produced a proxy-related work commit.
- The root cause is in browser extension media discovery semantics, especially `browser-extension/generic-video-detector.js` and popup scan aggregation.
