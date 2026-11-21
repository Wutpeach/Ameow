# Proposal

## Why

用户在2026-11-21实测后要求切片浮窗仅保留下载主动作，使用已有纯色Ameow图标和「下载」文字组成胶囊；退出继续通过浮窗外点击和Esc完成。

## What Changes

- 删除Peek右下关闭按钮，保留遮罩点击与Esc恢复原播放器、焦点及草稿。
- 下载改为「Ameow纯色图标 下载」胶囊，继续保留禁用、等待及真实受理反馈。
- 关闭浮窗保留页面胶囊与开启偏好，显式关闭页面工具仍生效。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-video-tools`：明确Peek下载胶囊和退出入口，并保留已有播放器/草稿/授权边界。

## Impact

影响browser-extension页面UI、相关浏览器回归、DESIGN及sidecar；不增加依赖，不改变下载协议和桌面受理权威。
