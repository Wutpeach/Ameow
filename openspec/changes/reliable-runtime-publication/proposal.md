# Proposal

## Why

Windows 首次准备在工具已探测后移动整个目录可能失败，旧流程又自动清理可复用文件，且诊断只剩 permission。#89 已批准将正式初始化改为最后发布完成标记，保留可信恢复输入并提供具体安全诊断；原用户失败根因仍未唯一确定。

## What Changes

- 在新的不可变 sibling 内完成获取、整套验证及必要探测，最后无覆盖发布完成标记文件。
- 失败保留有界候选中的可信包和文件；显式重试重新校验后按文件补缺，不覆盖原缓存。
- 安全诊断、历史与复制保留闭集操作、实际可得的数值 OS 错误和根来源。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `runtime-management`：完成标记发布、失败恢复及 typed 诊断。

## Impact

涉及 runtime.rs、preparation.rs、network.rs 与必要的队列诊断接线。保持锁、租约、取消和资源结算；不改应用更新、安装器、组件页或 Mac 性能策略，不引入重试或新依赖。由整合者统一同步 delta 与归档。
