# Harden yt-dlp portable invocation

## Goal
Make bundled yt-dlp downloads behave consistently across portable distributions by isolating them from host-machine yt-dlp config and by recovering from stale resume state that causes HTTP 416 failures.

## Requirements
- Add `--ignore-config` to app-managed yt-dlp invocations so bundled downloads do not inherit host yt-dlp configuration files.
- Detect HTTP 416 failures in the main yt-dlp download path and retry once after clearing resume artifacts.
- Use the retry path to disable resume artifacts for that retry only instead of changing global default resume behavior.
- Keep existing logging and terminal error code patterns intact.

## Acceptance Criteria
- [ ] Main yt-dlp downloads do not read host yt-dlp config files.
- [ ] A yt-dlp failure containing `HTTP Error 416` triggers at most one targeted retry with resume disabled.
- [ ] Non-416 failures preserve current behavior.
- [ ] Rust code remains panic-free and follows backend logging/error guidelines.

## Technical Notes
- FlowSelect currently builds yt-dlp args in both `download_video_internal` and `download_full_source_to_slice_cache`.
- The app should keep default resume behavior for normal runs, but 416 recovery should clean stale `.part` and `.ytdl` state before retrying.
- The retry shape can follow the existing YouTube-without-cookies retry branch to minimize churn.
