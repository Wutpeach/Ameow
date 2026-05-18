# Fix Xiaohongshu image download detection

## Goal
Fix the Xiaohongshu download flow so image posts are treated as image downloads instead of being misrouted into the video download pipeline.

## Requirements
- Preserve existing Xiaohongshu video download behavior.
- Detect Xiaohongshu image posts correctly even when the page contains video-like metadata or the extension/runtime provides ambiguous hints.
- Avoid invoking `yt-dlp` for Xiaohongshu image-only posts.
- Keep logging and error behavior consistent with existing download runtime contracts.

## Acceptance Criteria
- [ ] Xiaohongshu image posts no longer fail with `No video formats found!`.
- [ ] Xiaohongshu video posts still route through the expected video download path.
- [ ] Ambiguous or partial media hints do not silently override higher-confidence resolved media type decisions.

## Technical Notes
- Likely touches the browser-extension to desktop runtime media-type handoff and/or backend direct-download routing.
- Needs cross-layer verification because the bug may originate from hint extraction in one layer and fail in another.
