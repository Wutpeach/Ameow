# Proposal

## Why

快切的8MiB有限请求已获Windows用户验收，当前精确路径却主动排除了相同输入优化。用户授权继续改善精确切片取数与编码，保持画质目标和精确边界；全链路启动/校验等待另留0.5.2，不属于本次。

## What Changes

- 将既有固定受管原生处理器的实际HTTPS逐轨门控复用于精确区间，保留原生转码、现有画质目标、认证与路由。
- 用少量本地合成短片比较当前fast和更快preset，只有没有明显质量/文件/兼容代价时才调整；明确需要取舍时保留现值并回报，取数优化独立交付。
- 只定向验证精确边界、音画、真实有限请求与必要门控，不重下用户作品或跑完整矩阵。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- download-execution：有限请求适用于当次实际YouTube直接HTTPS的快速与精确区间，精确仍保留重新编码和独立严格核验。

## Impact

既有yt-dlp Adapter/嵌入处理器及相关定向测试；无新插件框架、GPU路径、下载器、组件或链路重构。本人Windows根main复测，Mac与完整CI不在本轮验证范围。
