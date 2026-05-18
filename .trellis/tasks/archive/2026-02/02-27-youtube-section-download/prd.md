# Brainstorm: YouTube Section Download

## Goal
Enable FlowSelect to download a specific time range from YouTube videos (and preferably YouTube clip links), with a smooth UX from browser player interaction to backend `yt-dlp` execution.

## What I already know

- Existing YouTube extension path injects one download button into `.ytp-right-controls` and only sends `{ url, pageUrl, title }` (no start/end time).
- Existing bridge path is unified: `youtube-detector.js` -> `background.js` (`video_selected`) -> Rust WebSocket handler -> `download_video_smart` -> `yt-dlp`.
- Current Rust `yt-dlp` invocation has no section arguments; it downloads full video output and tracks progress events.
- Existing YouTube route intentionally skips extension cookies to reduce challenge failures.
- Reference project `Rohanc28/YoutubeSectionDownloader` is a simple Python script:
  - Primary: `yt-dlp --download-sections "*start-end"`
  - Fallback: download full video then `ffmpeg -ss/-t` trim
  - No browser extension/player UI integration.
- `yt-dlp` official README confirms:
  - `--download-sections` supports time-range mode with `*start-end`
  - `*from-url` can use URL-extracted `start_time`/`end_time`
  - section download path needs ffmpeg.

## Assumptions (temporary)

- We should prefer `yt-dlp --download-sections` as primary implementation, not full-download-then-cut.
- Browser extension is needed for good UX (set In/Out directly on YouTube player), at least for manual range selection.
- MVP scope can start from `youtube.com/watch` pages first.

## Open Questions

- None for MVP.

## Requirements (evolving)

- Add time-range fields to extension payload while keeping current `video_selected` compatibility.
- Add YouTube player-side controls to capture In/Out timestamps from current playback time and trigger section download.
- Base interaction is click-only on player controls (`Set In` / `Set Out` / `Download Clip`) without a manual timestamp input panel.
- Add backend path to pass section args into `yt-dlp` when range is provided.
- Keep existing full-download behavior unchanged when range is not provided.
- Preserve progress/completion event behavior and cancellation semantics.
- Validate invalid ranges (start >= end, malformed timestamp, zero-length segment).
- MVP site scope is `youtube.com/watch` only.

## Acceptance Criteria (evolving)

- [x] User can set start/end on a YouTube video and trigger section download from extension UI.
- [x] `Set In` / `Set Out` capture current player time accurately and update extension state.
- [x] Backend runs `yt-dlp` section mode and outputs clipped result.
- [x] No-range requests still use current full-download behavior.
- [x] Invalid range fails fast with clear error and completion event emitted.
- [x] At least one manual test passes for: watch page section download, no-range fallback, invalid range rejection.

### Manual Verification Notes (2026-02-27)

- Verified watch-page IN/OUT capture and clip trigger from player controls.
- Verified no-range request still downloads full video path.
- Verified invalid range is rejected with terminal completion behavior.
- Verified YouTube download path works with corrected runtime args and extension cookie path.

## Definition of Done (team quality bar)

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Technical Approach

- Extension (`youtube-detector.js`):
  - Keep existing full-download button.
  - Add `Set In`, `Set Out`, `Download Clip` controls in YouTube player right controls.
  - Capture current `video.currentTime` on click and send optional `clipStartSec/clipEndSec` in `video_selected`.
- Bridge (`background.js`):
  - Normalize and forward optional clip fields while preserving existing payload shape.
- Backend (`lib.rs`):
  - Parse/validate optional clip range from WebSocket payload.
  - If range exists, append `--download-sections "*start-end"` to yt-dlp args.
  - Keep no-range flow unchanged and emit terminal completion on invalid range.

## Implementation Plan (small PRs)

- PR1: Extension controls + payload plumbing (clip fields optional, full-download compatibility).
- PR2: Rust clip-range parse/validation + yt-dlp section args.
- PR3: Manual verification, docs/spec touch-ups, Phase 2 backlog notes.

## Out of Scope (explicit)

- Non-YouTube platform section download in this task.
- Multi-segment batch in a single click (e.g. download 3 ranges at once).
- Full timeline editor UI inside desktop app.
- YouTube progress-bar range overlay and draggable IN/OUT handles (deferred to Phase 2).
- URL auto-range (`--download-sections *from-url`) for clip/share links (deferred after MVP).
- First release support for `youtube.com/shorts` and YouTube clip pages (deferred after MVP).

## Technical Notes

- Key current files:
  - `browser-extension/youtube-detector.js`
  - `browser-extension/background.js`
  - `src-tauri/src/lib.rs` (`video_selected` handling + `download_video_internal`)
  - `browser-extension/manifest.json`
- Relevant internal specs:
  - `.trellis/spec/guides/video-download-patterns.md`
  - `.trellis/spec/backend/direct-download-onboarding-contracts.md`
  - `.trellis/spec/backend/sidecar-runtime-contracts.md`
- External references:
  - https://github.com/Rohanc28/YoutubeSectionDownloader
  - https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/README.md

## Research Notes

### What similar tools do

- Lightweight scripts use CLI-only inputs (URL + timestamps), then rely on `yt-dlp --download-sections`.
- Fallback strategy is often "full download + ffmpeg trim" when section extraction path fails.
- They usually do not integrate with browser player controls, so UX cost is manual timestamp entry.

### Constraints from our repo/project

- Existing architecture already has browser extension button injection and unified `video_selected` contract.
- Backend already runs `yt-dlp` sidecar and progress lifecycle; adding args is lower-risk than adding a second trimming pipeline.
- YouTube route has special runtime/cookie handling that should not be regressed.

### Feasible approaches here

**Approach A: Extension-selected timestamps + yt-dlp sections** (Recommended)

- How it works:
  - Add In/Out capture in `youtube-detector.js` based on player `currentTime`.
  - Send range fields through existing payload.
  - Rust appends `--download-sections "*HH:MM:SS-HH:MM:SS"` when range exists.
- Pros:
  - Best UX in player.
  - Minimal architectural change (fits current extension->backend chain).
  - Single downloader stack (yt-dlp only).
- Cons:
  - Needs robust YouTube SPA button state sync.
  - Requires ffmpeg presence for section mode.

**Approach B: URL-only range support first (`*from-url`)**

- How it works:
  - Do not add player In/Out UI initially.
  - Detect clip/share URL params and pass `--download-sections "*from-url"` automatically.
- Pros:
  - Fastest to ship.
  - Very small UI change.
- Cons:
  - Only works when URL actually contains time range.
  - Does not solve "arbitrary custom segment" workflow.

**Approach C: Full download then ffmpeg local trim**

- How it works:
  - Keep current full yt-dlp download.
  - Run a second ffmpeg cut step in backend with chosen range.
- Pros:
  - More controllable trimming logic.
  - May work around extractor-specific section quirks.
- Cons:
  - Extra storage/time overhead.
  - More pipeline complexity and cleanup burden.
  - Duplicate logic with yt-dlp section capability.

## Decision (ADR-lite)

**Context**: We need YouTube time-range download with low implementation risk and good UX in current FlowSelect extension-driven architecture.

**Decision**: Choose Approach A for MVP: player-side In/Out capture in YouTube extension + backend `yt-dlp --download-sections`.

**Consequences**:
- Positive: aligns with existing extension -> background -> Rust -> yt-dlp pipeline, avoids introducing second trimming pipeline.
- Trade-off: requires stable player control injection/state sync and ffmpeg availability for section downloads.
- UI direction confirmed: base controls are in-player click actions (capture current time on click), not a form-based panel.
- Scope boundary confirmed: progress-bar visualization and draggable handles are not MVP.

## Expansion Sweep (Diverge -> Converge)

### Future evolution

- Multi-segment clip download (A-B, C-D) may be needed later.
- Unified section workflow across watch/shorts/clip URLs may be needed later.

### Related scenarios

- Full download must continue to work alongside section download.
- `video_selected` payload must remain backward compatible for existing detectors/routes.

### Failure & edge cases

- Handle `In >= Out`, missing In/Out, malformed timestamps, and unknown duration.
- Section download depends on ffmpeg availability in runtime chain; failures must return clear terminal errors.

### Converged MVP Boundary

- Implement minimal MVP first: watch page + click-to-capture In/Out + clip download.
- Defer progress-bar overlay/drag handles and URL-derived auto-range to Phase 2.
