# Proposal

## Why

两份 typed 媒体辅助观测写失败会在有效原生解析或传输后中止下载，primary 复制还可能再次将不可读或半文件变为致命错误。用户已批准仅解开这两份记录的保存/归档依赖，使独立验证与真实资源结算继续决定结果。

## What Changes

- `resolve-media.json`、`transfer-media.json` 及对应 `primary-*` 的保存/保留失败只使该观测不可用。
- 缺失、不完整、不可读、非普通文件或复制失败均安全省略；固定阶段与 unavailable 写入现有安全诊断承载，提示写失败不产生第二个致命依赖。
- 保持 typed 投影、输入/归档限额、其他证据错误语义、身份与媒体核验、发布及 Held 清理权威。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `download-execution`: 明确两份媒体辅助观测的非致命可用性及安全保留规则。

## Impact

仅涉及 yt-dlp 观测生成、automatic primary 保留、最终诊断归档和相应回归。无新依赖、重试、版本或发行变更；不放宽 native metadata、selection/final-object、身份、安全路径和媒体验证。基于 2026-11-22 已批准范围及外部 media-observation-validation-20261122 证据，在 main 基线 24efab16 上实施。
