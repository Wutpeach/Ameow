# Rename Process Name to FlowSelect

## Goal
Ensure the application process no longer appears as `main` and uses FlowSelect-aligned naming in project/package metadata.

## Requirements
- Update Node package metadata name from `main` to `flowselect`.
- Update Rust package name from `main` to `flowselect`.
- Update Rust library crate name from `main_lib` to `flowselect_lib` and keep entrypoint compiling.
- Keep Tauri product display name unchanged as `FlowSelect`.

## Acceptance Criteria
- [x] `package.json` no longer contains `"name": "main"`.
- [x] `src-tauri/Cargo.toml` package/lib names no longer use `main`/`main_lib`.
- [x] `src-tauri/src/main.rs` references the renamed lib crate and compiles.
- [x] `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- [x] `pnpm run type-check` passes.

## Technical Notes
- Use lowercase technical package names (`flowselect`, `flowselect_lib`) and keep UI/brand string as `FlowSelect`.
- If lockfile metadata updates because of package rename, include those updates in the same task.
