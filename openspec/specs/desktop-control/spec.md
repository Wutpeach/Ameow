# desktop-control Specification

## Purpose

为本机当前用户的脚本与 Agent 提供桌面 Ameow 控制契约，使下载任务与 GUI 共享身份、进度、权限和真实交付结果，并明确启动、断连与会话生命周期的边界。

## Requirements

### Requirement: 共用桌面下载权威

普通控制 CLI SHALL 连接当前用户的桌面实例，提供提交、列表、查看、取消、重试和等待。GUI 与普通 CLI SHALL 共用下载内核、任务和组件准备，应用更新期间的命令限制继续有效。不得建立第二套下载业务或独立无界面常驻服务。显式开发构建的有限独立执行遵守 developer-execution 约定，不改变普通控制 CLI 的任务生命期。

#### Scenario: 双向任务控制
- **WHEN** CLI 提交任务后，GUI 取消或重试该任务
- **THEN** CLI 读取同一队列的权威变化及同一任务标识，普通重试的新任务与 Gallery 同任务续作遵循现有规则。

### Requirement: 本机访问与普通应用启动

控制入口 SHALL 只允许本机当前用户访问，校验请求大小、协议、字段和身份。提交时无实例可自动启动普通应用，经过唯一 owner 仲裁并等待握手；CLI 不额外抢焦点，不改变已验收窗口与 Mascot 行为。权限、错版本、失联和启动失败 SHALL 明确报错。

#### Scenario: 并发提交启动
- **WHEN** 两个 CLI 同时向未运行的实例提交
- **THEN** 仅一个桌面队列 owner 处理任务，两个提交分别取得准确回执，不因启动竞争复制提交。

#### Scenario: 包内入口的隔离验入
- **WHEN** debug-only 的 app-update-fixture 从任务私有安装布局或应用包提交到显式 instance-root
- **THEN** Launcher 与普通桌面应用使用该域的同一实例仲裁及数据，Windows 保留真实 Ready/accepted 门槛且先验证公共 fixture 身份及入口字节；生产更新服务停用，正式构建不开放此测试例外。

### Requirement: 会话身份与有界请求关联

外部任务 ID SHALL 绑定随机实例身份；重启后旧 ID SHALL 被拒绝，不映射为新任务。写请求 SHALL 在真实受理边界关联并去重，同键不同内容拒绝；容量耗尽明确拒绝新写请求，不通过淘汰允许旧请求重新执行。不新增持久历史或断点续传。

#### Scenario: 已受理回执丢失
- **WHEN** 客户端在同一实例以相同关联键和内容重试提交
- **THEN** 返回原始任务身份且不新增下载；跨实例重试旧任务返回身份失效。

### Requirement: 机器输出与真实终态

CLI SHALL 提供非交互、版本化 JSON、稳定错误类别和退出状态，机器结果不混入日志。提交返回任务标识；等待区分成功、部分成功、失败、取消，资源结算后返回已交付文件的真实路径。设置、组件状态和安全诊断 SHALL 可读取，不扩大为全量写控制。

#### Scenario: 部分成功保留文件
- **WHEN** 集合任务完成为 Partial
- **THEN** 等待返回部分成功退出状态及所有实际已交付文件，而非把部分成功视为完整成功。

#### Scenario: 取消已受理但清理未确认
- **WHEN** 取消意图已受理，但原队列仍为 Held 或资源尚未结算
- **THEN** CLI 如实保留该状态与未释放字段，等待继续或按请求超时退出，不将受理回执转换成 Cancelled 终态。

### Requirement: 等待不拥有任务生命期

CLI 退出、中断、等待超时或连接断开 SHALL 不隐式取消下载。只有明确取消命令改变取消意图。等待 SHALL 对不存在任务、实例重启和失联返回明确错误。

#### Scenario: 等待超时后继续下载
- **WHEN** 等待时间达到上限或用户中断 CLI
- **THEN** CLI 退出，原桌面队列继续管理任务，可用原实例绑定 ID 再次查询。

### Requirement: 区间控制请求保持完整语义
控制入口 SHALL 使用同一桌面 owner 提交可选单区间，关联指纹包括范围。旧 owner/桥接不支持区间时 SHALL 明确拒绝，不忽略字段后提交整段；原生桥接只传递用户主动请求，不建立另一套下载业务或常驻服务。

#### Scenario: 相同关联键改变范围
- **WHEN** 同一实例收到相同请求键但不同范围
- **THEN** 拒绝关联冲突，不能复用原回执或新建隐式任务。

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
