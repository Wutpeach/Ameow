# Spec Delta

## MODIFIED Requirements

### Requirement: 真实结算屏障

系统 SHALL 在 root wait、已知 Job-zero、两个 reader 和 consumer join、监督驱动 join，以及所拥有文件清理后才允许释放；队列还 SHALL 等待外层执行 owner 的实际 join。kill 请求、EOF、超时、Drop 尝试或返回 Ok/Err 均不能单独证明结算。

#### Scenario: 控制或查询结果不确定

- **WHEN** 控制失败、query 不确定或仍有被占用的 owned 文件
- **THEN** 进入非终态 Held 并保留确切所有权；只有显式重试或 Windows 首次取消触发的一次有界清理推进证明全部屏障完成才能释放。

## ADDED Requirements

### Requirement: Windows Held 的一次取消推进

Windows live owner 已处于 Held 时，首次取消 SHALL 启动一次有界、幂等的既有清理推进。控制失败或成员未知时 SHALL 保留真实 owner、slot 与 Held，并提供显式重试；重复取消 MUST NOT 形成无限自动重试或释放终态。推进继续遵守 root wait、Job-zero、reader、consumer、驱动及外层 owner join 屏障，不影响其他任务的 Job。

#### Scenario: Held 写入器收到取消

- **WHEN** 查询故障导致存活写入器进入 Held，随后故障解除且用户首次取消
- **THEN** 取消启动真实终止与清理，结算后停止新增文件，仅发布一个真实终态并在所有 join 后释放 slot。

#### Scenario: 取消推进仍然失败

- **WHEN** 首次取消的清理推进仍遇到控制或查询故障
- **THEN** 保留 Held 和所有权，重复取消不继续自动推进；显式重试可再次尝试并在实际完成后结算。
