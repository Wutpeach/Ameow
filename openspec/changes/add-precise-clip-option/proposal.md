# Proposal

## Why

用户已批准在切片浮窗底栏增加按次选择的精确开关，以便在保留快速粗切默认体验的同时，为需要准确边界的片段显式选择重新编码。

## What Changes

- 下载左侧增加32px高「精确」勾选按钮，默认关闭，同作品保留，换作品/分P重置，清标记保留模式。
- 区间和模式一起经过扩展、桥接、桌面能力检查及队列冻结；旧端不支持时明确拒绝，不降为粗切。
- 开启时使用原生区间重新编码并验证帧边界；关闭沿既有快速流复制。进度、认证、取消与发布复用现有链路。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-video-tools`: 按钮、草稿模式生命周期、提交冻结及旧端拒绝。
- `download-execution`: 显式精确切分例外、模式冻结和真实媒体验证。

## Impact

扩展页面工具及协议、native/control能力、ClipRange、yt-dlp区间参数和verifier；不改账号授权、系统路由、全局默认设置或发行流程。
