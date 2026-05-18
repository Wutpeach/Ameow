# Fix Selection Download Stuck at Preparing and `.part` Residue

## Goal
Resolve slow/stuck selection download UX where the main window remains in `Preparing...` and `.part` files remain in the target directory.

## Requirements
- Parse yt-dlp progress from both stdout and stderr streams.
- Keep progress bar responsive after entering preparing state.
- Add a no-progress watchdog timeout for yt-dlp pipeline.
- Ensure `video-download-complete` is emitted on all terminal paths (success/error/timeout/cancel).
- Cleanup `.part` files on failure/timeout paths, not only on manual cancel.
- Route yt-dlp temp artifacts to dedicated temp directory (avoid visible `.part` in output folder as much as possible).
- Improve frontend stage text so users see actionable states instead of long `Preparing...`.

## Acceptance Criteria
- [ ] Selection download no longer stays indefinitely on `Preparing...`.
- [ ] During active yt-dlp download, progress updates are emitted and rendered.
- [ ] If yt-dlp stalls (no progress beyond threshold), task exits with error and closes progress UI.
- [ ] `.part` files are cleaned on cancel/failure/timeout.
- [ ] Successful download still returns file path and emits completion event.
- [ ] Existing direct-download flow behavior is not regressed.

## Scope
- `src-tauri/src/lib.rs`
  - yt-dlp stream handling and progress parsing
  - timeout watchdog
  - `.part` cleanup helper and call sites
  - optional temp path args for yt-dlp
- `src/App.tsx`
  - progress status display adjustments (stage-specific text)

## Technical Plan

### P0 (Required)
1. **Dual-stream progress parse**
   - Reuse progress parser for both `CommandEvent::Stdout` and `CommandEvent::Stderr`.
   - Emit `video-download-progress` whenever valid percentage line is found.
2. **Watchdog timeout**
   - Track last progress timestamp.
   - If no progress signal within threshold (e.g. 90s), terminate child and return timeout error.
3. **Unified `.part` cleanup on terminal failures**
   - Extract reusable cleanup function for output directory.
   - Invoke on cancel + fail + timeout paths.

### P1 (Recommended)
1. **Temp artifact location control**
   - Add yt-dlp args to place temporary files in dedicated temp directory.
2. **Frontend status messaging**
   - Show phase text such as `Extracting...`, `Downloading...`, `Merging...` when inferable.
   - Avoid long static `Preparing...` appearance.

## Risks / Notes
- yt-dlp output format can vary by extractor/site; parser should be defensive.
- Timeout should avoid false positives for very slow networks.
- Cleanup logic must never remove completed final media file by mistake.

## Validation
- Manual test with selection download from a known yt-dlp source.
- Validate cancel/failure/timeout each closes progress UI.
- Confirm no lingering `.part` in output dir after failure/cancel.
- Run lint/type-check/tests.
