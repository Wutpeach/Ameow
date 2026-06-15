# Record portable autostart settings reset report

## Goal

Record the user report that Windows portable builds appear to lose the configured output folder and global shortcut after reboot when autostart is enabled, without implementing a fix in this task.

## Requirements

- Preserve the current investigation outcome as a future work item.
- Keep the task in planning status; do not start implementation.
- Document the likely technical risk: portable builds currently read and write `settings.json` under Electron `userData`, not under the portable app root.
- Document that no current code path was found that intentionally clears `outputPath` or `shortcut` during reboot/autostart.
- Capture the relevant code references so future implementation can resume without rediscovering the same facts.
- Treat any actual fix, migration, or behavior change as out of scope for this record-only task.

## Acceptance Criteria

- [x] The task exists under `.trellis/tasks/` with status `planning`.
- [x] The PRD records the user-facing symptom.
- [x] The PRD records the suspected portable storage/design gap.
- [x] The PRD explicitly says no fix is included in this task.
- [x] Relevant validation already performed during investigation is documented.

## Investigation Notes

- User symptom: a portable-build user enabled autostart, set an output folder and global shortcut, then after computer reboot those settings appeared to reset.
- Config storage is centralized in `electron/configStore.mts`; `getConfigPath()` resolves to `join(app.getPath("userData"), "settings.json")`.
- `outputPath` falls back to `<Desktop>/Ameow_Received` when absent.
- Packaged startup reads `readStartupConfigSnapshot()` and registers the shortcut through `registerShortcutFromConfig(...)`.
- Windows autostart registration uses the current `process.execPath` with no extra args.
- Portable packaging writes `.ameow-portable.json` at the portable root for install-mode/update detection, but current main-process startup does not redirect `userData` to the portable root.
- The only current `app.setPath("userData", ...)` path found is for documentation screenshot capture via `AMEOW_DOCS_SCREENSHOT_USER_DATA`, not normal portable startup.

## Validation Performed

- `npm test -- --run electron/configStore.test.mts electron/autostart.test.mts electron/portableAppUpdate.test.mts src/desktop/config.test.ts src/utils/outputPath.test.ts`
- Result: 5 test files passed, 38 tests passed.

## Future Fix Direction

- Consider detecting `.ameow-portable.json` before config store initialization and setting `userData` to a stable portable-owned directory such as `<portableRoot>/data/userData`.
- Consider a one-time migration from the current Electron default `userData/settings.json` into the portable-owned settings file.
- Consider making startup shortcut registration failure non-fatal, because a global shortcut collision at login could otherwise look like settings loss or app startup failure.

## Notes

- This is intentionally PRD-only for now.
