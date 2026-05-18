# Optimize Dev Startup Performance

## Goal
Reduce FlowSelect desktop app startup latency in development mode by removing avoidable blocking waits before the first visible window and by deferring non-critical startup work.

## Requirements
- Fix the main-window startup flow so `loadURL`, reveal wait, and renderer-ready wait do not race in a way that falls back to timeout-driven delays.
- In development mode, show the main window as early as possible and move non-critical startup work off the first-visible-window critical path.
- Replace repeated expensive `predev` checks with a cached or on-demand strategy suitable for local development.
- Preserve existing packaged/runtime behavior unless a change is explicitly scoped to development mode.
- Keep renderer/preload/main-process contracts stable while changing the startup sequence.

## Acceptance Criteria
- [ ] `npm run dev` no longer performs the current unconditional heavy pre-start checks on every run.
- [ ] Electron main no longer waits on a stale reveal/renderer-ready sequence that can miss already-fired events and fall back to timeout-based delays.
- [ ] Development startup reaches the first visible window earlier than the current implementation.
- [ ] Non-critical startup work that can safely happen after the first visible window is deferred in development mode.
- [ ] `npm run type-check` passes after the startup flow changes.

## Technical Notes
- This task targets development-mode startup only.
- Packaged and portable startup optimization remains a follow-up after the dev-mode improvements are complete and verified.
- Relevant layers: dev runner scripts, Electron main process startup, renderer bootstrap, and startup-related IPC sequencing.
