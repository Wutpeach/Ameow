## ADDED Requirements

### Requirement: 显式 owner 的开发只解析

debug 开发 CLI SHALL 仅向显式选择且身份匹配、声明 inspection_v1 能力的现有 owner 提交只解析。请求 SHALL 为单 URL、单质量，返回实例绑定任务 ID，复用 show/wait/cancel。Held 的 retry SHALL 仅请求同任务清理重试；失败后重新解析需新请求。不得自动启动替代实例；旧 owner 缺能力、启动中或不允许命令时 SHALL 明确拒绝。普通 submit 与区间协商保持原语义。

#### Scenario: 旧 owner 缺少能力
- **WHEN** Hello 没有 inspection_v1 或不支持该能力
- **THEN** CLI 在提交前报能力不支持，不提交下载或启动另一实例。

#### Scenario: 解析取消和结算
- **WHEN** 用户显式 cancel 只解析任务
- **THEN** 仅该任务取消；受理不代表终态，Held 保持未释放，真实结算和外层 owner join 后才返回 Cancelled。

### Requirement: 机器输出显示连接实例

已有 CLI 机器输出 SHALL 提供 Hello 的安全实例身份、PID、应用版本、协议、能力和启动/命令可用状态，与 CLI 自身版本区分。仅在 owner 可信提供精确构建 hash 时输出该值，否则为 unknown；缺能力字段不推测支持。

#### Scenario: 版本相同但构建未知
- **WHEN** CLI 与 owner 的应用版本相同且 owner 没提供构建 hash
- **THEN** 输出仍区分 client 与 owner，构建 hash 为 unknown，保留真实实例 ID 和能力。
