# Sync pasted video downloads with extension quality preference

## Goal
Make video links pasted into the main FlowSelect window use the same yt-dlp quality / container preference that the browser extension uses, instead of always falling back to the current hardcoded `best` path.

## Requirements
- Main-window pasted video downloads must resolve their default yt-dlp quality from persisted config instead of hardcoded `Best`.
- If no preference has been synced yet, the desktop app should default to the extension's default quality behavior.
- Extension preference changes should be synced to the desktop app config without requiring an extension-triggered download first.
- AE-friendly conversion preference should stay aligned with the same sync flow.
- Existing extension-triggered downloads must keep their current explicit preference behavior.

## Acceptance Criteria
- [ ] Pasting a Bilibili URL into the main window no longer defaults to `Best` / `mkv` when the effective preference is `balanced`.
- [ ] After changing extension quality in the popup, a subsequent pasted-link download uses the same effective quality preference.
- [ ] Extension-triggered downloads still pass explicit quality / AE settings through the existing websocket payload.
- [ ] Config parsing / persistence failures return descriptive errors and do not panic.

## Technical Notes
- Current root cause: `download_video` and `queue_video_download` hardcode `YtdlpQualityPreference::Best` and `ae_friendly_conversion_enabled: false`.
- Extension source of truth lives in `browser-extension/direct-download-quality.js`.
- Cross-layer flow: extension storage -> background websocket -> Rust config -> queued download defaults.
