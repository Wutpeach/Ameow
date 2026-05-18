# Build Local Windows Portable Package

## Goal
Generate a local Windows portable build of FlowSelect using the repository-standard packaging flow.

## Requirements
- Use the existing `npm run package:portable` entrypoint instead of ad hoc packaging commands.
- Produce the versioned portable ZIP artifact under `src-tauri/target/release/bundle/portable/`.
- Produce the matching browser-extension ZIP artifact alongside the portable ZIP.
- Keep the working tree clean unless a build script unexpectedly modifies tracked files.

## Acceptance Criteria
- [ ] `npm run package:portable` completes successfully on this machine.
- [ ] `src-tauri/target/release/bundle/portable/FlowSelect_<version>_windows_x64_portable.zip` exists.
- [ ] `src-tauri/target/release/bundle/portable/FlowSelect_<version>_browser_extension.zip` exists.
- [ ] The unzipped portable directory refreshes successfully, or the script reports that only the ZIP was updated because the directory was in use.

## Technical Notes
- Prefer the repository packaging script in `scripts/package-portable.ps1`.
- The portable artifact must bundle only `FlowSelect.exe`, `binaries/yt-dlp-x86_64-pc-windows-msvc.exe`, and `binaries/flowselect-cli-proxy-x86_64-pc-windows-msvc.exe`.
- `ffmpeg` and `deno` are managed runtimes and must not be reintroduced into the portable ZIP.
