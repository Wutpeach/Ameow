# Add WeChat Channels Advanced Download Mode

## Goal
Add an optional advanced mode to FlowSelect that supports downloading WeChat Channels videos from the WeChat desktop client through a local MITM-based capture pipeline, while keeping the existing browser-extension download flow unchanged.

## Requirements
- Add a new advanced mode for WeChat Channels that is disabled by default and clearly separated from the normal browser-extension download flow.
- Support Windows as the first implementation target. macOS support may share the same architecture but is secondary. Linux is out of scope for the first implementation.
- Add certificate management capabilities for the advanced mode:
  - check status
  - install certificate
  - uninstall certificate
  - expose status to the frontend
- Add local proxy management capabilities for the advanced mode:
  - start proxy
  - stop proxy
  - inspect proxy status
  - restore the original system proxy on shutdown or mode disable
- The proxy layer must only MITM and modify the WeChat Channels targets needed for capture:
  - `channels.weixin.qq.com`
  - `res.wx.qq.com`
- If the user already has a system proxy enabled, FlowSelect must preserve compatibility through upstream-proxy chaining instead of blindly overwriting the user's network setup.
- Existing system proxy state must be snapshotted before activation and restored on exit, mode disable, or startup recovery if the previous session exited unexpectedly.
- The injected page script must not use the browser extension pipeline. It must be delivered by the local proxy and must capture WeChat Channels video metadata from the WeChat desktop webview/runtime.
- The injected script must extract and send normalized metadata to the backend:
  - `id`
  - `url`
  - `decodeKey`
  - `title`
  - optional `coverUrl`
  - optional `fileSize`
  - optional `duration`
  - optional `uploader`
  - `capturedAt`
- The backend must store captured WeChat Channels items separately from the current extension-driven queue input.
- Add a WeChat Channels download pipeline in Rust that:
  - downloads the captured media URL directly
  - decrypts the first `131072` bytes using ISAAC/XOR with `decodeKey`
  - writes a playable local file
  - reports progress and completion through typed Tauri events
- The first implementation must not route WeChat Channels downloads through yt-dlp and must not reuse the browser-extension `video_selected` contract.
- Add settings UI for advanced mode state, certificate status, proxy status, and compatibility status when an existing system proxy is detected.
- Add main-window UI support for:
  - advanced mode runtime status
  - captured item list access
  - download progress and completion for WeChat Channels captures
- Normal FlowSelect features must continue to work when advanced mode is disabled.

## Public Interfaces
### Tauri Commands
- `check_wechat_channels_certificate_status() -> Result<WechatChannelsCertificateStatus, String>`
- `install_wechat_channels_certificate() -> Result<WechatChannelsCommandResult, String>`
- `uninstall_wechat_channels_certificate() -> Result<WechatChannelsCommandResult, String>`
- `start_wechat_channels_proxy() -> Result<WechatChannelsProxyStatus, String>`
- `stop_wechat_channels_proxy() -> Result<WechatChannelsProxyStatus, String>`
- `get_wechat_channels_proxy_status() -> Result<WechatChannelsProxyStatus, String>`
- `list_wechat_channels_captures() -> Result<Vec<WechatChannelsCapture>, String>`
- `clear_wechat_channels_captures() -> Result<bool, String>`
- `download_wechat_channels_capture(capture_id: String) -> Result<WechatChannelsDownloadAck, String>`

### Tauri Events
- `wechat-channels-capture`
- `wechat-channels-proxy-status`
- `wechat-channels-download-progress`
- `wechat-channels-download-complete`

### Payload Contracts
- `WechatChannelsCertificateStatus`
  - `exists: boolean`
  - `installed: boolean`
  - `path: string | null`
- `WechatChannelsProxyStatus`
  - `enabled: boolean`
  - `port: number | null`
  - `systemProxyManaged: boolean`
  - `upstreamProxy: string | null`
  - `originalSystemProxy: string | null`
  - `certificateInstalled: boolean`
  - `restorePending: boolean`
- `WechatChannelsCapture`
  - `id: string`
  - `url: string`
  - `decodeKey: string`
  - `title: string`
  - `coverUrl?: string`
  - `fileSize?: number`
  - `duration?: number`
  - `uploader?: string`
  - `capturedAt: string`
- `WechatChannelsDownloadAck`
  - `accepted: boolean`
  - `captureId: string`
  - `traceId: string`

## Acceptance Criteria
- [ ] Advanced mode can remain fully disabled, and FlowSelect's existing extension/video download behavior remains unchanged.
- [ ] Settings page shows certificate and proxy state for the advanced mode through typed Tauri commands.
- [ ] When advanced mode starts with no existing system proxy, FlowSelect can manage the system proxy and restore it when stopped.
- [ ] When advanced mode starts while a user proxy such as Clash Verge is already enabled, FlowSelect enters upstream-proxy compatibility mode instead of breaking the user's proxy setup.
- [ ] The proxy only MITMs the required WeChat Channels domains and does not inject unrelated sites.
- [ ] A WeChat Channels page opened inside the WeChat desktop client can produce at least one normalized capture item in FlowSelect.
- [ ] A captured WeChat Channels item can be downloaded into a playable local file through the Rust decrypting downloader.
- [ ] Download success, failure, and cancel paths all emit terminal completion events so the UI cannot get stuck.
- [ ] If the app exits unexpectedly after system proxy takeover, startup recovery can detect and repair the stale proxy state.
- [ ] Logs for the new backend flow use the existing `>>> [Rust]` format and do not print sensitive token or cookie data.

## Validation And Error Matrix
| Condition | Validation Point | Expected Behavior |
| --- | --- | --- |
| Advanced mode disabled | Settings/main window command entry | No proxy or certificate action runs implicitly |
| Certificate missing | Proxy start path | Return actionable error and keep status visible in UI |
| Existing system proxy detected | Proxy start path | Record original proxy and chain it as `upstreamProxy` |
| Upstream proxy unavailable | Proxy runtime startup | Fail with explicit error; do not leave the system in a half-switched state |
| Capture payload missing `url` or `decodeKey` | Local capture ingestion | Reject payload and keep UI stable |
| WeChat page injection fails | Proxy response rewrite path | No crash; report status/logging for troubleshooting |
| Download canceled | Backend download task | Emit terminal completion event with cancel-safe error summary |
| Decrypt key invalid | Download/decrypt pipeline | Return terminal error without leaving partial success state |
| App closes while system proxy is managed | Shutdown path | Attempt restoration and mark `restorePending` for startup recovery if needed |
| Startup sees stale managed proxy state | Startup recovery path | Restore original system proxy or notify that recovery failed |

## Good / Base / Bad Cases
- Good:
  - User has no system proxy enabled, turns on advanced mode, captures a WeChat Channels video, downloads it successfully, and FlowSelect restores the original network state on stop.
  - User already uses Clash Verge at `127.0.0.7:7897`, turns on advanced mode, FlowSelect chains that proxy upstream, capture works, and the original proxy is restored afterward.
- Base:
  - Advanced mode is enabled, certificate is installed, proxy starts, but no WeChat page is currently open; UI shows running status with zero captures and no regressions.
- Bad:
  - FlowSelect overwrites an existing system proxy without snapshot/restore support.
  - Capture is wired into the existing `video_selected` browser-extension path and creates ambiguous cross-layer behavior.
  - A failed/canceled WeChat Channels download does not emit a terminal completion event.

## Technical Notes
- This task is a fullstack, cross-layer, OS-sensitive feature. Implementation must explicitly define boundaries across:
  - system proxy state
  - local MITM proxy
  - injected WeChat page script
  - backend capture store
  - frontend settings/runtime UI
- Follow the existing command/event typing conventions already used in `src-tauri/src/lib.rs`, `src/App.tsx`, and `src/pages/SettingsPage.tsx`.
- Keep the first implementation independent from yt-dlp routing and from the browser-extension WebSocket message contract.
- After implementation lands, add or update code-spec documentation for the WeChat Channels advanced mode contract under `.trellis/spec/`.
- Expected primary touchpoints:
  - `src-tauri/src/lib.rs`
  - `src/App.tsx`
  - `src/pages/SettingsPage.tsx`
