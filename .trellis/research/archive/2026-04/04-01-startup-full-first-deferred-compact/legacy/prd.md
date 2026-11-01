# Startup Full-First Window Reveal And Deferred Compact Init

## Goal
Change the Windows first-launch startup path so the main window starts in full native bounds, only compacts after an idle delay, and defers non-critical startup initialization until the first expand/settle flow has completed.

## Requirements
- First Windows main-window reveal should no longer start in native compact `80x80` mode.
- The app should still compact after idle using the existing compact behavior.
- Startup should not immediately auto-compact on first reveal; compacting should happen only after the normal idle delay.
- Later compact and expand behavior should remain driven by the existing triggers:
- mouse enter / leave
- download or transcode foreground flows
- compact again after idle once those flows settle
- Non-critical startup work should be deferred until the first expand animation has settled or a bounded fallback delay has elapsed.
- Deferred startup work should include runtime dependency bootstrap-related checks and app update checks, while preserving existing command and event contracts.
- Changes must preserve Electron preload/runtime boundaries and avoid reintroducing direct renderer-to-Electron imports.

## Acceptance Criteria
- [ ] On Windows first launch, the main window reveals at full native bounds instead of `80x80`.
- [ ] The first user-visible compact transition happens only after idle, not immediately on startup.
- [ ] After the first compact settles, later icon-to-window and window-to-icon transitions still work from existing hover/task triggers.
- [ ] Non-critical startup initialization does not compete with the first reveal/settle path.
- [ ] Existing startup command/event contracts remain compatible.
- [ ] Relevant unit tests are updated or added for startup mode and renderer startup timing behavior.

## Technical Notes
- Expected touch points are Electron startup-mode selection plus renderer startup/idle orchestration in `src/App.tsx`.
- Keep the current foreground-task restore contract intact: native bounds must be restored before full renderer state is shown.
- Prefer a bounded deferred-start helper over spreading new startup flags across many unrelated effects.
