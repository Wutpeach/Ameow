# Implementation Plan

## Checklist

- [x] Load frontend extension specs before editing.
- [x] Add or refine generic scanner tests for noisy page links, current-page fallback, and candidate-scoped previews.
- [x] Keep `browser-extension/generic-video-selection-utils.js` behavior stable unless tests prove a shared utility change is necessary; tighten popup anchor filtering at the `generic-video-detector.js` call site to avoid selection-flow blast radius.
- [x] Update `browser-extension/generic-video-detector.js` to:
  - [x] produce a high-confidence `source: "current_page"` candidate when a visible player exists, direct HTTP video URLs are unavailable, and the current URL is a plausible content URL;
  - [x] canonicalize YouTube `/watch?v=...` by preserving only the current video id parameter;
  - [x] canonicalize Bilibili `/video/BV...` and `/bangumi/play/...` current-item URLs;
  - [x] suppress generic current-page fallback on Pinterest hosts;
  - [x] keep explicit direct media URL candidates;
  - [x] remove low-confidence ordinary page links from default video scan results;
  - [x] avoid using page-level `og:image` as the preview for every direct link candidate.
- [x] Add `current_page` to `popup.js` source labels.
- [x] Update `.trellis/spec/frontend/type-safety.md` if needed so the popup media scan contract matches candidate-scoped preview behavior.
- [x] Preserve Pinterest/scoped detector behavior; add tests or fixtures that prove site-specific video candidates are not overwritten by generic current-page fallback.
- [x] Verify popup rendering still handles candidates without previews gracefully.
- [x] Run focused extension tests, then relevant full validation.

## Validation Commands

```bash
npm test -- browser-extension/generic-video-detector.test.js browser-extension/generic-video-selection-utils.test.js browser-extension/pinterest-detector.test.js browser-extension/youtube-detector.test.js
npm run lint
npm run type-check
```

## Risk Notes

- Over-filtering anchors can hide legitimate direct media links. Keep explicit media extensions and real element/source/performance candidates.
- Over-prioritizing current page URLs can hurt Pinterest-style sites. Preserve site-specific/scoped candidates above generic fallback.
- Missing previews are better than wrong shared previews; popup UI should tolerate absent `previewUrl`.
- Changing `classifyVideoCandidateType()` has shared-flow blast radius. Prefer call-site filtering in popup scan unless a broader contract update is intentionally planned.
