# extension quality selection for ytdlp tiers

## Goal

将浏览器扩展中的画质选择从“直链候选排序”改为“控制 `yt-dlp` 下载档位”，同时让直链下载默认使用最高可获得画质。

## Requirements

* 扩展弹窗中的画质选择用于控制 `yt-dlp` 下载档位。
* 直链下载不再受扩展画质选择影响，默认选择最高可获得画质。
* `Best` 表示当前账号权限下最佳可用画质。
* `Balanced` 表示尽量选择 `1080p`，没有时回退到最接近且可用的画质。
* `Data Saver` 表示尽量选择 `360p`；没有 `360p` 时，优先选择低于 `360p` 的最低可用画质；如果平台最低档本身高于 `360p`，则选择该平台最低可用画质。
* 旧扩展存储值 `high` / `standard` 需要兼容映射到新档位。

## Acceptance Criteria

* [ ] 扩展 UI 文案明确说明画质选择控制的是 `yt-dlp` 下载。
* [ ] 抖音/小红书直链下载始终优先最高质量候选。
* [ ] WebSocket 下载消息能把扩展画质偏好传到 Rust 侧。
* [ ] Rust 侧 `yt-dlp` 下载能按 `Best / Balanced / Data Saver` 三档选择格式。
* [ ] 现有类型检查和 Rust 编译通过。

## Technical Approach

浏览器扩展继续维护统一的画质偏好存储，但语义改成 `yt-dlp` 档位控制。background 在发送 `video_selected` 时携带 `ytdlpQualityPreference`，同时对直链候选统一按最高质量排序。Rust 侧新增 `YtdlpQualityPreference` 枚举，并在 smart route、直链 fallback、clip cache 下载三条路径上统一使用该偏好生成 `yt-dlp` format selector。

## Out of Scope

* 新增应用内 UI 来控制 `yt-dlp` 画质。
* 为每个平台分别暴露更细粒度的分辨率选项。
* 对直链站点做真正的服务端画质协商。

## Technical Notes

* Files changed:
  `browser-extension/direct-download-quality.js`
  `browser-extension/background.js`
  `browser-extension/popup.html`
  `src-tauri/src/lib.rs`
* Verification:
  `cargo fmt --manifest-path src-tauri/Cargo.toml`
  `cargo check --manifest-path src-tauri/Cargo.toml`
  `npm run typecheck`
  `node --check browser-extension/background.js`
  `node --check browser-extension/direct-download-quality.js`
  `node --check browser-extension/popup.js`
