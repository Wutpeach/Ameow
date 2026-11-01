# Normalize yt-dlp Downloads to AE-Safe Output

## Goal
Preserve the existing three-tier yt-dlp quality design (`best` / `balanced` / `data_saver`) while ensuring downloaded videos can be imported into After Effects without exposing `mkv` or incompatible codec combinations to mainstream users.

## Requirements
- Keep the current browser extension quality UI unchanged.
- Keep the current yt-dlp selection behavior unchanged so `best` can still preserve the highest account-visible tier, including cases that currently merge to `mkv`.
- Add a backend post-download normalization pass for yt-dlp outputs before the terminal success event is emitted to the frontend.
- Probe the downloaded media first and skip post-processing when the file is already AE-safe (`mp4` container with `h264` video and `aac` audio).
- When normalization is required, prefer GPU video encoding by default.
- If GPU encoding is unavailable or the GPU transcode attempt fails, retry automatically with CPU encoding instead of failing immediately.
- Normalize the final user-visible output to AE-friendly `mp4` with `h264` video, `aac` audio, and stable pixel format settings.
- Keep progress/completion events stable so frontend behavior and queue handling do not regress.
- Keep failure messages actionable and support-log-friendly for ffprobe / ffmpeg probe and transcode stages.
- Update the video download spec to document the new post-processing contract and regression expectations.

## Acceptance Criteria
- [ ] A `best` yt-dlp download may still use `mkv` internally to preserve high-tier streams, but the user-visible final file is normalized to AE-safe `mp4` when needed.
- [ ] `balanced` and `data_saver` continue to honor their existing selection behavior without UI changes.
- [ ] Files that are already `mp4 + h264 + aac` bypass unnecessary re-encoding.
- [ ] Files with incompatible container or codecs are automatically normalized before success is reported.
- [ ] The backend tries GPU encoding first on supported platforms and falls back to CPU automatically on failure.
- [ ] `video-download-progress` / `video-download-complete` continue to emit valid payloads and do not leave the UI stuck.
- [ ] Temporary/intermediate files are cleaned up or kept out of the user-facing output path.
- [ ] Specs capture the new AE-safe normalization behavior, fallback matrix, and tests.

## Technical Notes
- Primary implementation area: `src-tauri/src/lib.rs`.
- Likely new helper areas:
- `ffprobe` media inspection helper to read container/video/audio characteristics.
- AE-safe normalization helper that chooses remux vs audio transcode vs full transcode.
- GPU encoder selection should reuse the existing hardware encoder probe policy (`h264_nvenc` / `h264_qsv` / `h264_amf` on Windows, `h264_videotoolbox` on macOS) before falling back to `libx264`.
- Use `spawn_blocking` for ffprobe / ffmpeg child-process work.
- Preserve existing three-tier `YtdlpQualityPreference` semantics; do not add new extension controls.
- Ensure the final success path only resolves after post-processing is complete and the emitted file path points to the normalized user-visible output.

## Execution Plan
- Phase 1: Add PRD/spec updates and define the normalization contract.
- Phase 2: Implement backend media probe and AE-safe normalization helpers.
- Phase 3: Insert normalization into yt-dlp success paths and keep completion/progress semantics correct.
- Phase 4: Verify GPU-first / CPU-fallback behavior and document residual risks.
