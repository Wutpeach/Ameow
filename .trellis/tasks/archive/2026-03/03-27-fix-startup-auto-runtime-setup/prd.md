# Fix Startup Auto Runtime Setup

## Goal
Restore the first-launch startup flow so FlowSelect automatically downloads and configures missing runtime files instead of only showing the persistent bottom-left reminder.

## Requirements
- Identify the startup/runtime dependency check that drives the bottom-left reminder in the main window.
- Preserve the reminder UI feedback for pending, busy, warning, success, and retry states.
- Fix the missing trigger, state transition, or backend invocation that should start automatic setup during first launch.
- Keep manual retry working when automatic setup cannot proceed.
- Avoid regressing later launches after the required files are already present.

## Acceptance Criteria
- [ ] On a missing-runtime first launch, the app starts the setup flow automatically without requiring manual retry.
- [ ] The bottom-left reminder reflects real progress and does not get stuck in a repeated idle reminder state.
- [ ] When runtime files are already present, the app does not re-run unnecessary setup work.
- [ ] Manual retry still works after the fix.
- [ ] `npm run lint` and `npm run type-check` pass for the touched code.

## Technical Notes
- Likely area spans frontend reminder/startup state and backend runtime setup commands.
- Existing style-only task `03-27-normalize-first-launch-reminder-style` should remain behavior-neutral.
- Cross-layer verification is required because reminder state and runtime setup execution likely cross React and Tauri boundaries.
