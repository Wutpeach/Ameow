# Fix mac drag expand, unified download feedback, and video preparation latency

## Goal
Deliver a stable macOS drag-to-expand interaction, unify image/video foreground completion feedback into a single animation path, and reduce or better structure slow video preparation before real download bytes arrive.

## Shipped / In Progress
- macOS drag-to-expand reliability has already been addressed in prior commits and should be preserved.
- image completion feedback now exists, but animation parity with video completion is still not fully solved because image and video outcomes still render through different React trees.
- blocking yt-dlp title probe before download start has already been removed, but YouTube/Bilibili still spend noticeable time in source parsing before first byte download.

## Requirements
- Preserve the already-fixed macOS drag-to-expand behavior without regressions.
- Replace the current split image/video foreground outcome rendering with a single shared outcome overlay and state model.
- Ensure image loading, image success, image failure, video success, and video failure all use the exact same overlay container, motion constants, and icon frame.
- Keep image/video outcome positioning stable in compact/full transitions with no visible jump, left shift, or flash-back to center.
- Reduce user-perceived latency for YouTube/Bilibili startup by trimming avoidable heavy yt-dlp startup args for simple URL downloads while preserving the heavier extractor path for injected/current-item/cookie-backed cases.
- Keep successful download routing, post-download renaming, and transcode follow-up semantics unchanged.

## Acceptance Criteria
- [ ] A single `ForegroundOutcomeOverlay`-style render path is used for foreground loading / success / error feedback across image and video flows.
- [ ] Image completion animation matches video completion animation because both paths share the same lifecycle and layout context, not just similar motion constants.
- [ ] No foreground loading ring or success/error icon visibly shifts left/right/up/down or flashes back into place during outcome transitions.
- [ ] The foreground loading ring uses the same visual component as the video progress ring.
- [ ] Plain YouTube/Bilibili URL downloads avoid the heaviest yt-dlp startup extractor/runtime options unless injection/current-item/cookies context requires them.
- [ ] Early video status still surfaces accurate "resolving/parsing" feedback before real download progress appears.

## Technical Notes
- Root cause of the remaining animation issue: image foreground outcome and video completion outcome still render through different React branches (`isProcessing` path vs `primaryTask` completion path), so Motion still sees different layout contexts even after earlier constant/centering refactors.
- Recommended implementation: consolidate foreground outcome state into one overlay model and render one shared absolute overlay inside the main panel container.
- Recommended video startup optimization: keep the lightweight early progress event, but only apply YouTube heavy extractor args (`player_js_variant=tv`, remote components, extra JS runtimes) when request context indicates injected/current-item/cookies-backed extraction rather than for every plain URL.
- This task remains cross-layer: browser drag payload -> main window state -> frontend foreground outcome overlay -> Electron download lifecycle -> yt-dlp startup strategy.
