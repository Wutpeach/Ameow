# Proposal

## Why

目前解析与下载绑在同一次执行，无法先用正式登录态查看媒体摘要再决定是否下载；CLI 自身版本也不能说明连接到哪个 owner。需要在组合候选上复用正式生命周期提供这两个已批准能力。

## What Changes

- debug 开发 CLI 向显式指定的现有 owner 提交单 URL、单质量、yt-dlp 单作品只解析请求，使用正式认证与资源结算。
- 返回有界安全媒体摘要和独立 Inspected 终态，复用 show/wait/cancel，不进入 transfer、验证或发布。
- 已有机器输出增加 Hello 提供的实例、版本、能力和启动状态；未知构建 hash 保持 unknown。
- 整合 CLI 开发工具、登录态与区间契约，保留独立 dev run/scenario 的匿名开发域边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `desktop-control`: 只解析命令协商、实例绑定、机器摘要和终态。
- `download-execution`: 独立 metadata-only 执行与安全摘要。
- `developer-execution`: 区分独立 run/scenario 与连接既有 owner 的 inspect。

## Impact

影响 control、下载 Adapter、队列和开发指南；复用受管 runtime、attempt 快照和监督器，不增加依赖。完整格式枚举、硬网络预算、任意 argv、认证导入导出、dev Ctrl+C 治理和 dev run 区间参数不在范围内。
