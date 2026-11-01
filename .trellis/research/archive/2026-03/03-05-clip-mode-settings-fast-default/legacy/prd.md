# Add Clip Mode Toggle in Settings (Fast Default)

## Goal
Add a settings-level clip mode preference (`fast` / `precise`) while keeping the main window UI unchanged and simple.

## Requirements
- Add a new clip mode option in `SettingsPage`.
- Persist clip mode in app config.
- Default clip mode must be `fast` for users without explicit preference.
- Backend download pipeline must read this preference for each new clip task.
- Mode changes apply to **new tasks only**; currently running downloads are unaffected.
- Keep main UI unchanged (no new controls on the main floating window).

## Acceptance Criteria
- [ ] Settings page shows selectable clip mode options: `fast` and `precise`.
- [ ] On fresh install or missing config key, effective mode is `fast`.
- [ ] Changing mode persists and survives app restart.
- [ ] New selection-download tasks use the chosen mode.
- [ ] Ongoing task does not switch behavior mid-download.
- [ ] Lint/type-check/tests pass.

## Scope
- `src/pages/SettingsPage.tsx`
  - Add clip mode setting UI and interaction.
- `src-tauri/src/lib.rs`
  - Extend config contract with clip mode field.
  - Read mode at task start and branch arguments/strategy.
- (If needed) config load/save helpers where defaults are applied.

## Technical Notes
- Recommended config key: `clipMode`, values: `"fast" | "precise"`.
- Backward compatibility: if key is absent/invalid, fallback to `"fast"`.
- Runtime safety: mode is captured once when task starts; no hot swap for in-flight jobs.

## Future Work (Not in this task)
- Add optional per-task override in advanced workflow.
- Add GPU encoder probe for precise mode acceleration.
- Add telemetry for mode usage and task duration comparison.
