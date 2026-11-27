# Spec Delta

## MODIFIED Requirements

### Requirement: 显式开发门槛与完整隔离

开发执行 SHALL 仅在显式启用开发特性的 debug 构建可用，release 构建 MUST 拒绝该特性。有限 run/scenario 每次执行 SHALL 要求独立数据根，固定派生配置、runtime 和 output，拒绝生产域交叠及已有运行记录，不启动桌面或生产更新服务。正式媒体查询按 desktop-control 连接桌面 owner；开发有限执行不得创建独立匿名域替代该 owner 的正式会话。

#### Scenario: 普通构建拒绝开发命令
- **WHEN** 未启用开发特性的 CLI 收到 dev 命令
- **THEN** 返回明确错误，不启动应用或访问生产队列。

#### Scenario: 同根误复用
- **WHEN** 调用者选择生产数据域或已经保存开发运行记录的根
- **THEN** 拒绝执行，保留原数据与证据。
