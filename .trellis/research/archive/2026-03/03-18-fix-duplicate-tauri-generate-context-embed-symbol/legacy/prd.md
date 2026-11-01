# Fix Duplicate Tauri generate_context Embed Symbol

## Goal
Fix the macOS/dev compile failure where Tauri startup emits `symbol _EMBED_INFO_PLIST is already defined`.

## Requirements
- Ensure the Rust crate expands the Tauri context/embed macro only once.
- Preserve both startup paths:
  - normal desktop app startup
  - installer runtime bootstrap startup
- Keep the installer bootstrap path behavior unchanged apart from the compile fix.
- Prevent debug/dev startup from being silently swallowed by the single-instance plugin when a hidden FlowSelect instance is already running.
- Avoid touching unrelated frontend work already present in the working tree.

## Acceptance Criteria
- [ ] `src-tauri/src/lib.rs` no longer contains multiple textual `tauri::generate_context!()` invocations.
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- [ ] The normal startup path and installer bootstrap path both still receive a valid Tauri `Context`.
- [ ] `npm run dev:all` no longer exits immediately just because another hidden dev instance is already running.

## Technical Notes
- The current duplicate call sites are in `installer_runtime_bootstrap_context()` and the main `.build(...)` path.
- The safe fix is to centralize context generation in one helper and reuse it.
- The debug startup path currently uses the same single-instance policy as release, which is hostile to iterative local dev for an accessory-style macOS app with no Dock icon.
