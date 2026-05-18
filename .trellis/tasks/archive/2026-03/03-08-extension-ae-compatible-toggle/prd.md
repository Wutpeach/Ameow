# Add extension AE-compatible download toggle

## Goal
Separate "highest quality" from "AE-friendly conversion" so users can download higher-quality videos without being forced into a long final transcode step unless they explicitly opt in.

## Requirements
- Add a browser extension popup toggle for AE-friendly post-download conversion.
- Persist the toggle in extension local storage with a safe default of `false`.
- Include the toggle value in the extension `video_selected` websocket payload.
- Update Rust payload parsing to read the new boolean field with a default of `false`.
- Only run AE-safe normalization for yt-dlp downloads when the toggle is enabled.
- Keep existing direct-download behavior and AE Portal handoff unchanged.
- Keep copy clear that the toggle is for After Effects compatibility and may slow completion.

## Acceptance Criteria
- [ ] A new AE-friendly toggle appears in the extension popup and persists across reopen.
- [ ] New installs default to Highest/Balanced behavior without forced AE conversion.
- [ ] Extension-initiated yt-dlp downloads skip the final AE normalization when the toggle is off.
- [ ] Extension-initiated yt-dlp downloads still run AE normalization when the toggle is on.
- [ ] The new payload key is optional and older extension payloads continue to work.
- [ ] Lint/build checks pass for the touched frontend and extension code.

## Technical Notes
- Treat the new websocket field as an extension-scoped preference, not desktop config.
- The backend contract should default missing `aeFriendlyConversionEnabled` to `false`.
- Keep the finalization branch explicit so future progress-stage improvements can hook into the same decision point.
