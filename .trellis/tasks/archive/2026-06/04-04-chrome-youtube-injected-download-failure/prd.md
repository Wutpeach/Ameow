# Chrome YouTube Injected Download Failure

## Goal
Identify why the YouTube injected download button fails on macOS Chrome with `ERROR: [youtube] <id>: Requested format is not available`, while the same URL succeeds when pasted into the main window and also succeeds from the injected button in Edge.

## Requirements
- Capture the exact request payload sent from the browser extension when the injected button is used.
- Capture the effective `yt-dlp` invocation details used by the desktop runtime for injected downloads.
- Compare Chrome vs Edge injected-download payloads on the same machine.
- Confirm whether the failure is caused by browser-specific extension state, request shaping, or downstream argument differences.
- Avoid changing user-facing download behavior during the logging-only investigation pass.

## Acceptance Criteria
- [ ] A reproducible comparison exists for macOS Chrome vs Edge on the same machine using the same YouTube URL.
- [ ] Logs show the extension payload fields for injected downloads, including `url`, `pageUrl`, `selectionScope`, `siteHint`, title presence, and cookie presence.
- [ ] Logs show the desktop runtime `yt-dlp` binary path and the key arguments derived from the injected request.
- [ ] The investigation narrows the root cause to one concrete browser/extension/runtime difference.
- [ ] Any follow-up fix can be scoped from the logged evidence without repeating broad exploratory debugging.

## Technical Notes
- Current confirmed repro:
  - macOS Mac mini packaged `rc5`
  - Chrome injected YouTube download fails
  - Edge injected YouTube download succeeds
  - Main-window paste of the same `https://www.youtube.com/watch?v=nfFnd1AA7bY` URL succeeds
- Confirmed non-causes so far:
  - `yt-dlp` version mismatch: both devices show `2026.03.17`
  - Manual `Update yt-dlp`: not used
  - Runtime readiness: `ffmpeg` / `deno` are ready
  - URL cleanliness: the tested YouTube URL is already canonical
- Relevant code paths:
  - Extension injected button payload assembly in `browser-extension/youtube-detector.js`
  - Extension background forwarding in `browser-extension/background.js`
  - Desktop queue entry in `electron/main.mts`
  - Runtime command normalization in `src/electron-runtime/commandRouter.ts`
  - `yt-dlp` execution in `src/electron-runtime/ytDlpDownload.ts`
