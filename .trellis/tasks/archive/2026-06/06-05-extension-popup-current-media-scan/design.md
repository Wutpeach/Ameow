# Design

## Problem Shape

The popup currently presents a broad scan of page media-like candidates as if they were the current page's media. That is too loose for modern video sites:

- YouTube/Bilibili players often expose `blob:` or MSE-backed video elements, so direct element URL extraction produces no usable HTTP URL.
- The generic scanner then scans anchors and treats ordinary URLs as video candidates if they contain broad words such as `video`, `play`, or `media`.
- Link candidates reuse the page-level `og:image` preview, so unrelated rows can all show the same thumbnail.

The fix should change the candidate model from "everything suspicious on the page" to a ranked current-item model.

## Candidate Layers

Rank popup video candidates in these layers:

1. Site-specific current item or scoped item
   - Examples: Pinterest Pin video candidates from Pin JSON, scoped card payloads, injected site detector payloads.
   - These may include `pageUrl`, `videoUrl`, `videoCandidates`, title, and scoped previews.
   - They must not be overwritten by generic current-page fallback.

2. Current visible player / current content page
   - If a visible or active video element exists but only exposes `blob:` / unusable URLs, create a current-page/current-item candidate when the current URL is a plausible content URL.
   - Do not replace a usable direct HTTP video element/source URL with a page URL fallback; the page URL candidate is specifically for blob/MSE-backed players.
   - Use canonical page URL where possible.
   - Use page title and page-level metadata as fallback preview only for this current item.

3. Direct media files
   - Keep explicit `.mp4`, `.webm`, `.m3u8`, `.mpd` HTTP URLs.
   - Prefer element/source/performance entries over anchors.
   - Use scoped preview only when available.

4. Low-confidence page links
   - Ordinary page links should not appear in the default video tab.
   - A future UI can expose these separately as page links or related content, but this task keeps them out of current media results.

## Preview Rules

Preview selection must be candidate-scoped:

- Video element candidate: `poster`, nearby scoped image, then current-page metadata fallback.
- Direct link candidate: nearby anchor/card image only; no blanket page-level `og:image`.
- Current-page/current-item candidate: page-level `og:image` is acceptable as fallback.
- Site-specific candidate: keep provider metadata and scoped extraction result.

## Site Compatibility

YouTube and Bilibili benefit from current-page canonical candidates because their public page URLs are the correct download entry for yt-dlp.

Pinterest needs scoped extraction. The generic current-page fallback should only run after site-specific candidate providers have no usable scoped candidate, and it should not suppress direct Pin video candidates.
In this task, the generic fallback should explicitly avoid Pinterest hosts so Pin/video candidates from the Pinterest detector or direct `pinimg` media are not flattened into a generic page URL.

Unknown sites should use visible player/current-page fallback conservatively: require a visible video signal and a content-like current URL before creating a current-page candidate.

YouTube `/watch?v=...` needs explicit canonicalization because the existing generic media-route regex handles path segments like `/video/BV...` but not query-param identifiers. The current-page candidate builder should keep only the essential video id query parameter for YouTube.

## Boundaries

- Do not change desktop download execution or yt-dlp command behavior.
- Do not redesign the popup UI in this task.
- Do not introduce a broad "all page links" UI section unless separately planned.

## Claude Review Notes

Claude reviewed this plan and agreed with the layered model, with these adjustments:

- Tighten popup anchor filtering at the `collectVideoScanCandidates()` call site instead of changing the shared `classifyVideoCandidateType()` utility. That utility is also used by selection/context-menu flows.
- Add `source: "current_page"` for generated current-item candidates and label it in popup source display.
- Resolve the current frontend spec conflict: direct-link candidates should not blanket-use page-level `og:image`; missing previews are preferable to misleading shared covers.
- Suppress generic current-page fallback on Pinterest hosts and preserve direct/scoped Pin media behavior.
