# Portable Packaging: Auto-refresh yt-dlp

## Goal
Ensure portable packaging always includes up-to-date `yt-dlp` and avoids duplicate sidecar binaries in different directories.

## Requirements
- Automatically refresh `src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe` before packaging.
- Keep a switch to skip yt-dlp refresh when needed.
- Package only one `yt-dlp` binary copy inside `FlowSelect_portable/binaries/`.
- Keep existing portable packaging output naming and flow.

## Acceptance Criteria
- [ ] Running `npm run package:portable` updates yt-dlp source binary first.
- [ ] Portable output has no duplicated root-level `yt-dlp-x86_64-pc-windows-msvc.exe`.
- [ ] `FlowSelect_portable/binaries/yt-dlp-x86_64-pc-windows-msvc.exe` exists.

## Technical Notes
- Use GitHub latest direct binary endpoint for Windows.
- Fail fast if refresh download fails, unless skip flag is explicitly provided.
