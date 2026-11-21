# Design

## Context

动机见 proposal.md。队列已经在同一发布权威下仲裁取消并保留外层 owner；GPUI 命令通道非阻塞，成功回执原先没有持续展示事实。Windows supervisor 的 Held gate 位于取消检查之前。基线包含 PR74 两处 Mac 修复。

## Goals / Non-Goals

以既有 ownership 与 phase 为权威，增加受理后的取消事实和本地发送状态，不创造提前终态。大文件复制、Mac settlement 与其他 UI 任务维持各自范围。

## Decisions

- JobSnapshot 增加带 serde 默认值的 cancellation_requested，由正式队列接受取消后更新。保留原阶段和 Held 原因；不用易被投影覆盖的 message 作为状态源。
- UI 本地记录待回执取消，先反馈发送中；受理后依快照取消事实，拒绝清除此状态并显示原位原因。取消事实优先于进度，Held 优先于普通取消中。复用字号、布局、图标和低动效。
- Windows 用取消从 false 到 true 的一次边沿推进既有 cleanup retry；异常后仍等待显式重试。禁止每次 step 或重复 cancel 重试。
- 针对受影响状态做正式队列与原生回归，真实受控窗口入口交来源集中验收。所有构建、受管工具 fixture、输出与日志位于本任务独立目录。

## Risks / Trade-offs

- 发布与取消竞态 → 复用同一权威并断言单一终态。
- UI 回执与快照先后 → 本地待回执仅过桥，正式取消事实与真实终态清除旧反馈。
- 持续控制失败 → 如实 Held、保留 owner 和显式重试，不自动循环。
- 本机 Windows 无法证明 Mac 原生体验 → 保留 PR74 证据并按共享接口做针对性编译覆盖。
