# Fix Single-Item Playlist Selection for YouTube and Bilibili

## Goal
Ensure extension-triggered downloads for YouTube and Bilibili download only the currently selected item, even when the page URL also carries playlist, collection, multi-part, or season context.

## Requirements
- Create a dedicated task for this fix and keep the work scoped to the playlist single-item bug.
- Normalize extension-triggered YouTube downloads to a canonical current-video URL instead of forwarding the raw page URL.
- Normalize extension-triggered Bilibili downloads to a canonical current-item URL that preserves current-part semantics such as `p=` or `ep`.
- Extend the extension -> background -> Rust payload contract with an explicit single-item selection signal.
- Update the Rust yt-dlp invocation path so single-item extension downloads add a playlist guard and do not expand into the full playlist.
- Preserve existing clip-download behavior and the current full-download behavior for non-playlist URLs.
- Keep logging and payload parsing consistent with existing backend conventions.

## Acceptance Criteria
- [ ] Clicking the YouTube FlowSelect download button on a `watch?v=...&list=...` page downloads only the current video.
- [ ] Clicking the Bilibili FlowSelect download button on a multi-part, collection, or bangumi page downloads only the current item.
- [ ] Clip downloads on YouTube and Bilibili still work and only download the current selected item.
- [ ] Non-playlist video downloads continue to work without behavior regressions.
- [ ] The extension/background/Rust contract for single-item selection is documented in this task and implemented consistently.

## Contract
- Target code-spec files:
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
  - `.trellis/spec/backend/type-safety.md`
  - `.trellis/spec/backend/logging-guidelines.md`
- Payload contract:
  - Extension sends a canonical `url` for the current item.
  - Extension includes `selectionScope: "current_item"` for player-triggered YouTube/Bilibili downloads.
  - Background forwards the normalized `url` and `selectionScope` to the desktop app.
  - Rust treats `selectionScope == "current_item"` as authoritative for playlist guarding.
- Validation and error matrix:
  - Missing or invalid canonical URL: fall back to the existing page URL rather than sending an empty URL.
  - Missing `selectionScope`: preserve current behavior for old senders.
  - Current-item requests with playlist context: add yt-dlp single-item guard.
  - Non-current-item requests: do not change current behavior.
- Good / Base / Bad cases:
  - Good: YouTube watch page with `list=` downloads only the current `v`.
  - Base: Regular single-video URLs continue to download normally.
  - Bad: Current-item request still expands to all playlist entries.

## Technical Notes
- Main files expected:
  - `browser-extension/youtube-detector.js`
  - `browser-extension/bilibili-detector.js`
  - `browser-extension/background.js`
  - `src-tauri/src/lib.rs`
- Preferred fix shape:
  - Normalize URLs in the detectors/background.
  - Add a `selectionScope` field to the message contract.
  - Add `--no-playlist` in Rust for current-item extension downloads.
- Keep this task separate from unrelated yt-dlp naming or Windows runtime tasks.
