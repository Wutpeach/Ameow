# Slice Download Performance & Stability Master Fix

## Goal
Fix the real-world slice download experience issues end-to-end:
- avoid false timeout kills during active processing,
- improve perceived and actual performance,
- reduce diagnostic noise,
- support repeated slicing scenarios efficiently.

This is a **master task**. The settings toggle (`fast` / `precise`) is only one sub-task.

## Problem Statement
- Users observe long `Preparing...` / `Downloading...` states during slice downloads.
- `.part` files appear in output folder and may remain on abnormal termination.
- Active `ffmpeg` progress (`frame=... time=... speed=...`) can still be misjudged as stalled.
- `[WS] Client disconnected` adds noise during troubleshooting.
- Repeated slicing on same source may re-download unnecessarily.

## Scope
- `src-tauri/src/lib.rs` (download lifecycle, watchdog, cleanup, mode strategy, WS logging, cache strategy entry)
- `src/App.tsx` (progress display behavior)
- `src/pages/SettingsPage.tsx` (clip mode preference UI)
- Config contract (persist default mode and runtime read)

## Phased Plan

### P0 - Stability First (highest priority)
1. **Sliding-window watchdog with heartbeat tiers**
   - Replace simplistic timeout behavior with `last_active_timestamp`.
   - Heartbeat classification:
     - **Hard heartbeat**: download percent increases, ffmpeg `time=` increases, output file bytes increase.
     - **Soft heartbeat**: stage logs (Extracting/Merging/Post-processing text-only lines).
   - Rule:
     - If no hard heartbeat in 90s => timeout candidate.
     - Soft heartbeat may extend only short grace (e.g. +20s cap), not indefinite keep-alive.
2. **Two-stage termination**
   - On timeout candidate: graceful terminate first, then force kill if needed.
3. **Unified cleanup and error code**
   - Ensure `.part` cleanup for cancel/failure/timeout.
   - Emit structured terminal error code for diagnostics.

### P1 - UX & Mode Layer
1. **Fast / Precise mode**
   - Add setting-level mode preference:
     - `fast` (default) for speed-first slicing.
     - `precise` for accuracy-first slicing.
   - Applies to **new tasks only**; in-flight task does not hot-switch.
2. **Progress stage state machine**
   - Normalize frontend status display to explicit stage states, avoid fragile free-text inference.

### P2 - Performance Layer
1. **Precise mode hardware acceleration**
   - Add runtime encoder probe and fallback:
     - Windows: `nvenc` / `qsv` / `amf`
     - macOS: `videotoolbox`
   - If unavailable => CPU fallback without breaking flow.

### P3 - Repeated Slice Reuse (hybrid strategy)
1. **Do not force full-cache mode globally**
   - Keep default incremental slicing (`--download-sections`) for one-off tasks.
2. **Hybrid reuse for repeated slicing**
   - Trigger reuse when same `video_id + format` is sliced repeatedly in short window.
   - Cache source in tmp (not user output folder), output folder contains only final slices.
   - Add TTL + size cap + integrity check; bad cache auto re-download.

## Acceptance Criteria
- [ ] Continuous `frame=... time=...` output no longer triggers false 90s kill.
- [ ] True stall terminates within ~90s and reports clear terminal error code.
- [ ] `.part` cleanup is deterministic for cancel/failure/timeout.
- [ ] `[WS] Client disconnected` no longer pollutes normal error diagnosis.
- [ ] Fast/Precise mode selectable in Settings, default `fast`, and only new tasks affected.
- [ ] Repeated slicing supports hybrid reuse strategy without regressing one-off performance.
- [ ] Lint/type-check/tests pass.

## Non-Goals
- No main-window UI clutter for mode switch in this task.
- No hard requirement to fully cache every sliced source video.

## Implementation Order Recommendation
1. Deliver **P0 + WS log downgrade** first.
2. Then deliver **P1 mode UX + state machine**.
3. Then **P2 GPU probe**.
4. Finally **P3 hybrid cache reuse**.
