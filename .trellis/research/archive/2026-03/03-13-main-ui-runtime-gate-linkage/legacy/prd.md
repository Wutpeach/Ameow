# implement: main UI runtime gate prompt and task linkage

## Goal
Finish the remaining runtime dependency gate UI work by wiring the main floating window to the existing runtime dependency status and gate state, and make the prompt react to task queue activity without disturbing the current compact progress/queue experience.

## Requirements
- Load runtime dependency status and gate state in `src/App.tsx` using the existing typed Tauri commands and event payloads.
- Reuse the existing Settings runtime gate decisions from the main window so the user can recheck, allow, or skip from the floating UI when the gate is waiting on confirmation.
- Show a compact runtime readiness prompt in the main window when missing runtime dependencies are relevant, including phase, missing component summary, and failure state.
- Link the prompt to task activity so queued or active video work can surface runtime readiness pressure, while idle states stay visually restrained.
- Keep the main task progress ring, queue badge, minimize behavior, and existing yt-dlp update affordance intact.
- Add localized desktop copy for any new main-window runtime strings in both `locales/en/desktop.json` and `locales/zh-CN/desktop.json`.

## Acceptance Criteria
- [ ] Main window loads runtime dependency snapshot and gate state with explicit TypeScript generics and listens for `runtime-dependency-gate-state`.
- [ ] A compact runtime gate surface appears in the main window for missing/blocked/failed/downloading states and reflects current missing items or error text.
- [ ] When the gate is awaiting confirmation, the main window exposes allow/skip controls that call `set_runtime_dependency_user_decision`.
- [ ] The main-window runtime prompt changes emphasis when video queue activity exists, without breaking queue popover, progress, or success/error flows.
- [ ] Type checking passes after the change.

## Technical Notes
- Follow the compact-card interaction model already used in `SettingsPage.tsx`, but adapt it to the 200x200 floating panel rather than duplicating the settings layout.
- Use shared types from `src/types/runtimeDependencies.ts` instead of inline `any` payloads.
- Keep the change frontend-scoped unless research during implementation proves a missing backend event or contract.
