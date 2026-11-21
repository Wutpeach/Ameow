# Proposal

## Why

失败复制目前只有稳定代码与通用建议；认证下载清理原始输出后，数值退出码、当次执行身份及有依据的引擎原因也随之丢失，难以定位问题。用户要求在现有隐私边界内保留失败时可确认的事实并贯通最终复制文本。

## What Changes

- 失败摘要携带有类型约束的引擎退出码、观察时间、引擎报告类别/HTTP 状态及证据是否截断。
- 保留 Job/attempt、实际 runtime 租约摘要/版本、可获得的构建指纹与真实平台。
- 复用现有 settlement、attempt-error、Failure 历史和复制路径，不保留或复制原始认证输出；未知事实明确未知。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `queue-lifecycle`: 扩展安全复制字段及未知/引擎报告来源边界。

## Impact

影响下载 Adapter 分类与 settlement、Failure 类型、Runner 安全持久摘要、队列历史与复制文本。无新依赖、无新日志系统、无自动重试或登录行为变化；不恢复旧 B 站失败的已丢失原文。
