# Stabilize macOS First-Run Runtime Bootstrap Window Behavior

## Goal
Fix the macOS first-run experience so the main floating window stays responsive and visible while FlowSelect bootstraps managed runtime dependencies such as `ffmpeg`, `ffprobe`, and other sidecar tools.

## Requirements
- Keep the main floating window out of idle icon mode while runtime dependency bootstrap is active.
- Avoid high-frequency runtime status refresh work during runtime gate download progress.
- Preserve the existing contract that managed runtime bootstrap starts only after the main window becomes visible.
- Keep existing Tauri command names and runtime gate event payloads unchanged.

## Acceptance Criteria
- [ ] On a clean macOS runtime state, startup-triggered managed runtime bootstrap does not auto-collapse the main window into icon mode while downloads are active.
- [ ] Runtime gate progress updates no longer trigger repeated heavyweight status probes that can stall the UI.
- [ ] The runtime dependency indicator still updates correctly through bootstrap start, progress, success, and failure states.
- [ ] Existing runtime bootstrap entry points and cross-layer contracts remain compatible.

## Technical Notes
- The frontend currently treats video downloads/transcodes as active work, but runtime dependency bootstrap is not counted in the idle-minimize guard path.
- `runtime-dependency-gate-state` currently causes the frontend to re-request runtime status on every update; on macOS this can repeatedly invoke the non-Windows `yt-dlp --version` status probe.
- Prefer the smallest cross-layer fix that keeps runtime gate progress visible without introducing new command/event surface area.
