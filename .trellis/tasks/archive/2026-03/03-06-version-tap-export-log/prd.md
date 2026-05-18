# Export Diagnostic Log From Version Tap

## Goal
Replace the hidden version-tap developer-mode toggle with a support-focused action that generates a diagnostic log file users can send to the developer.

## Requirements
- Keep the existing version tap threshold interaction on the settings page.
- Replace the devtools toggle action with a Tauri command that writes a diagnostic log file under the app tool/config directory.
- Return the generated log file path to the frontend so the UI can show a success hint.
- Include enough context in the log to help debugging without requiring users to open devtools.
- Fail gracefully with user-visible error hints when log export fails.

## Acceptance Criteria
- [ ] Tapping the version label to the threshold creates a timestamped diagnostic log file.
- [ ] The success hint tells the user that the log was created.
- [ ] The frontend/backend command contract is typed explicitly.
- [ ] Existing settings behavior outside version tapping is unchanged.

## Technical Notes
- Prefer a minimal new Tauri command instead of reusing devtools toggling.
- Reuse existing config-path utilities so the file lands in a predictable app-owned location.
- Update code-spec docs for the new command contract if implementation establishes a reusable pattern.
