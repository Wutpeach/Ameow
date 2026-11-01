# Auto open support log directory after export

## Goal
Automatically open the generated support-log directory after the version-tap export succeeds.

## Requirements
- Keep the existing support-log export trigger on version tap unchanged.
- After `export_support_log` succeeds, automatically open the directory containing the generated log file.
- Reuse the existing cross-platform `open_folder` Tauri command for macOS and Windows support.
- Preserve non-blocking failure behavior: if folder opening fails, the export should still count as successful and the user should still see a success hint.

## Acceptance Criteria
- [ ] Tapping the version label 5 times still generates `flowselect-support-*.log`.
- [ ] On successful export, the OS opens the containing folder automatically on macOS and Windows.
- [ ] If auto-open fails, Settings does not crash and still shows a useful hint.

## Technical Notes
- Compute the folder path in the frontend from the returned log-file path.
- Use `invoke<void>("open_folder", { path })` to keep the existing command contract.
