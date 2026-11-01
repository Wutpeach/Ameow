# Retry Video Selection After On-Demand Connect

## Goal
Make browser-extension video downloads succeed on the first click when the desktop app starts after the extension and the websocket connection is not ready yet.

## Requirements
- Treat `video_selected` as a shared request path for all supported video platforms.
- When a user triggers `video_selected` while disconnected, force an immediate websocket connect attempt.
- Wait a short time for the desktop app websocket to become available, then automatically send the same request once the connection opens.
- Return an accurate success/failure result to the content script instead of reporting success only because a reconnect was started.
- Keep other websocket request flows unchanged unless they need small compatibility updates for the shared request helper.

## Acceptance Criteria
- [ ] A first download click after opening the desktop app can queue the video without requiring a second click.
- [ ] The retry behavior is implemented in the shared extension background path, not in a YouTube-only detector.
- [ ] All existing `video_selected` entry points still route through the shared background logic.
- [ ] The websocket response path can confirm the request was accepted by the desktop app queue.

## Technical Notes
- Prefer extending the existing request-response websocket path with `requestId` support for `video_selected`.
- Keep the retry window short so the click does not hang indefinitely when the desktop app is still unavailable.
