# Bundle ffmpeg for portable downloads

## Goal
Remove the hidden dependency on a system-installed `ffmpeg` so packaged FlowSelect builds, especially the Windows portable ZIP, can reliably merge yt-dlp video/audio streams into a single output file.

## Requirements
- Bundle a project-managed `ffmpeg` binary with packaged app resources and the Windows portable ZIP.
- Resolve bundled `ffmpeg` at runtime using the same resource probing model used for other runtime binaries.
- Make yt-dlp explicitly use the resolved `ffmpeg` location instead of relying on the user's `PATH`.
- Route internal Rust ffmpeg invocations through the same resolved binary path.
- Clean up yt-dlp split-stream artifacts like `.f30112.mp4` and `.f30280.m4a` on failure/cancel paths.
- Keep logging and errors descriptive when bundled `ffmpeg` cannot be resolved or launched.
- Update project specs to capture the portable/runtime contract and this hidden-environment dependency class.

## Acceptance Criteria
- [ ] Packaged app resources include `ffmpeg` for supported packaged targets touched by this change.
- [ ] Windows portable packaging includes `ffmpeg` in both root and `binaries/` locations alongside existing runtime binaries.
- [ ] yt-dlp download commands pass an explicit ffmpeg location derived from the bundled runtime.
- [ ] Internal post-processing and clipping paths use the resolved bundled `ffmpeg` binary.
- [ ] Failed/cancelled yt-dlp runs remove `.f*.<ext>` split-stream artifacts from output/temp directories.
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- [ ] Portable packaging script still completes successfully after the binary list change.

## Technical Notes
- Reuse `binary_candidate_paths()` for runtime probing to stay aligned with current Tauri resource lookup behavior.
- Prefer bundled `ffmpeg`; only fall back to system `ffmpeg` if bundled resolution fails and the system binary exists.
- Keep the change scoped to runtime binary resolution and packaging, without changing frontend command/event contracts.
