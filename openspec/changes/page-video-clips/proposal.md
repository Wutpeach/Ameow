# Proposal

## Why

用户在网页观看视频时，需要一击下载整段，或直接在原播放器标记 I/O 后提交片段，避免重新找播放位置。#50 已确认页面工具条、Peek 和边界优先裁剪，并授权完整实施。

## What Changes

- 首批 YouTube/Bilibili 单作品点播提供可独立启用的图标工具条，与 Cookie 授权分离。
- 原播放器进入可恢复的中央 Peek，提供播放、定位、可编辑 I/O 和单区间提交，包含低动效与可中断过渡。
- 同一桌面受理链路冻结范围与精确重编码策略，正确区分不同区间，验证输出并沿既有安全发布。
- 不支持区间的旧 owner/引擎明确拒绝；不静默整片下载后裁剪。

## Capabilities

### New Capabilities
- `page-video-tools`: 页面作品绑定、工具启用、Peek 生命周期与真实受理反馈。

### Modified Capabilities
- `download-execution`: 单区间执行与重编码输出验证。
- `queue-lifecycle`: 冻结范围、区间去重及显式重试。
- `desktop-control`: 可选范围和旧 owner 拒绝语义。

## Impact

依赖 PR63，base 为 cindy/sharp-jang 的堆叠 Draft；涉及 browser-extension、Native Messaging、control、下载意图、yt-dlp 与 verifier。不新增依赖或 HTTP 服务，不修改首页/README。直播、DVR、多区间、Firefox、图片/混合帖与全集选择不在本轮范围。
