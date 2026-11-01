# Unify bundled runtime binary layout

## Goal
Use `binaries/` as the single runtime source for bundled helper executables in development, installed builds, and the Windows portable ZIP.

## Requirements
- Resolve `yt-dlp`, `deno`, and `ffmpeg` from `binaries/` only.
- Stop relying on Tauri Windows sidecar root placement (`yt-dlp.exe`) as the primary runtime path.
- Keep `yt-dlp` downloads, version checks, and in-app updates working after the path change.
- Remove duplicate root-level helper executables from portable packaging output.
- Preserve descriptive error handling and `>>>` logging for runtime path failures.

## Acceptance Criteria
- [ ] Runtime path resolution no longer probes root-level helper executables.
- [ ] `yt-dlp` launch and version checks run via the resolved `binaries/` path.
- [ ] `update_ytdlp` updates the same single-source runtime binary.
- [ ] Windows portable packaging includes helper executables only under `binaries/`.
- [ ] Specs reflect the single-source `binaries/` contract.

## Technical Notes
- This is a backend/infra contract change spanning `tauri.conf.json`, Rust runtime path resolution, and packaging scripts.
- Tauri `sidecar("yt-dlp")` resolves to a root-level executable on Windows, so the runtime should use explicit binary paths instead.
