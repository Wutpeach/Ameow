# Proposal

## Why

#98 已批准更新推荐下载器并补足组件诊断。现有错误会丢失请求来源、失败阶段和 HTTP 状态，复制结果也未明确命名组件，无法可靠区分两个下载器的更新结果。

## What Changes

- 保留现有更新界面及复制入口，按组件输出目标版本、实际版本和安全失败上下文。
- 检查版本、获取资产/校验信息、下载、校验、启用保留准确阶段、服务、状态与可用数值重试线索；旧数据未知值不猜测。
- 双平台推荐 yt-dlp/gallery-dl 使用本次核验的正式资产，并更新中英文排查页。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `runtime-management`: 组件检查/更新的安全失败诊断与组件独立结果。

## Impact

运行时清单、upstream、runtime_update/trust、队列复制诊断、现有 UI 复制出口及中英 FAQ；不改变选择意图、可信校验、恢复和资源结算门。
