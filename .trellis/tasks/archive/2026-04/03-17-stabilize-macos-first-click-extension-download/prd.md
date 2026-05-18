# Stabilize macOS First-Click Extension Download Trigger

## Goal
Reduce the cases where clicking the injected YouTube download button on macOS does not queue a download until the user clicks multiple times.

## Requirements
- Keep the existing `video_selected` websocket contract unchanged unless local evidence proves a contract fix is necessary.
- Make the shared extension background request path more tolerant of a cold or reconnecting websocket so the first user click does not get dropped.
- Align YouTube control-bar injection timing with the repo's more defensive control-bar readiness pattern before adding custom buttons.
- Keep scope tight to the browser extension unless local evidence proves a desktop-side change is required.

## Acceptance Criteria
- [ ] A first click on the injected YouTube download button is less likely to be lost while the desktop app is available.
- [ ] The extension still reports an actionable failure when the desktop app is genuinely unavailable.
- [ ] Existing `video_selected` payload fields and request/response handling stay compatible with the Rust websocket handler.
- [ ] Other extension-triggered download sites keep using the same shared queueing path without regression.

## Technical Notes
- Current evidence points to two likely contributors:
- Shared request timing in `browser-extension/background.js`, where `video_selected` may still lose the first attempt while websocket connection state is cold or reconnecting.
- YouTube-only injection timing in `browser-extension/youtube-detector.js`, which currently injects as soon as `.ytp-right-controls` exists and is less defensive than the Bilibili implementation.
- Bilibili already uses a control-bar readiness check and is the closest local pattern to follow for the YouTube control surface.
