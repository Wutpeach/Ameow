# queue-lifecycle Specification

## Purpose

定义逻辑下载队列、冻结设置、调度、显式重试、安全诊断与停止权威。区分后台逻辑历史和前台可见行，避免历史 UI 决定反向改变业务状态。

## Requirements

### Requirement: 有序命令与原子设置

队列 SHALL 按顺序处理 Submit、SaveSettings、Retry 等命令，文件系统及准备工作不阻塞 GPUI 前台。缺失设置采用默认 Balanced；损坏/不可读设置如实失败。保存 SHALL 同目录原子落盘后才确认，失败保留上一次已确认值；已接受 Job 意图不变。重复的未完成对象 SHALL 拒绝且不改变旧任务；短链、BV/av 与分 P 的等价关系必须有身份证据，不能默认未指定 P 等同 P1。

#### Scenario: 保存设置期间提交任务

- **WHEN** 保存成功或失败与 Submit 依次到达
- **THEN** 新任务使用该顺序下真实已确认设置；不出现未落盘成功或回溯修改旧任务。

### Requirement: FIFO3 与终态权威

队列 SHALL 最多持有三个媒体执行 slot，准备独立占有；Held 保留 slot/lease。只有真实进程/文件结算及外层 owner join 后释放 slot 并启动下一个 ready FIFO 任务。每次逻辑执行 SHALL 只发布一个终态，旧 Job/attempt/revision 的观察不得复活已结束状态；集合显式续作遵循 artifact-delivery 的 attempt 例外。

#### Scenario: 三个执行中有一个最终失败

- **WHEN** 失败执行的 owner 已实际 join 并完成文件结算
- **THEN** 该 slot 才可交给下一 FIFO 任务；仅进程退出不能提前补位。

### Requirement: 原生恢复与显式重试分离

系统 MUST NOT 为最终失败的下载器自动重启、设置应用网络重试次数/backoff/deadline 或重排队。下载器在当前 Job 工作区内采用原生恢复，缺失必要 fragments 仍中止完整性交付。普通最终 Failure 的显式 Retry SHALL 创建新 Job，冻结原对象/画质/目录并保留旧 Failure；未解析失败短链不能静默改目标。已识别 Object::Gallery 的 Failure/Partial 同 Job 续作是已有明确例外。队列/Job 历史 SHALL 为本会话状态，不跨应用启动恢复。

#### Scenario: 最终 HTTP 403、429 或 opaque error

- **WHEN** 下载器已真正结算并返回最终失败
- **THEN** 发布安全、准确的失败类别或未知原因，不猜测 header/认证/代理原因，也不自动重新执行。

### Requirement: 安全诊断与真实操作回执

复制诊断 SHALL 只使用闭合白名单：应用/真实平台及可得构建指纹、Job/attempt 关联、失败阶段/时间、安全 site、实际组件租约摘要/版本及至多六个稳定失败摘要，总量至多 4096 ASCII 字符。可确认的引擎数值退出码、错误类别/HTTP 状态及证据是否可用或截断 SHALL 经安全持久摘要、队列历史进入复制文本；未知保持未知。HTTP 状态 SHALL 标明由引擎报告，不冒充独立响应验证或登录判断。不得包含重试预算、原始 stderr、标题、URL 路径/query、凭据或私有绝对路径。复制成功 SHALL 依赖 OS 真实写入成功；Retry/Cleanup/Cancel 的 UI 权限和回执不得制造业务成功。

#### Scenario: 重试被拒绝或命令通道不可用

- **WHEN** Retry 返回 Error 或 enqueue 被拒绝
- **THEN** 保留来源 Failure 和可重试展示；只有权威 Accepted 才按既有规则退役其可见行。

#### Scenario: 引擎报告已知 HTTP 或连接错误

- **WHEN** 实际引擎非零退出且完整错误观察明确报告 HTTP 状态、超时、DNS、TLS、代理连接或磁盘错误
- **THEN** 复制文本包含该有界类别及实际退出码、阶段/时间、任务关联和可得构建/runtime 身份；不复制自由错误原文，代理隧道错误不冒充目标站响应。

#### Scenario: 未知非零退出或证据缺失

- **WHEN** 引擎非零退出但没有可分类错误，或已有历史未保留新增事实
- **THEN** 仍输出可确认的退出码等事实，说明未分类、缺失或截断；不得把 exit code 1 当作原因，不能追溯恢复旧失败原文。

#### Scenario: 认证错误回显秘密

- **WHEN** 认证下载错误包含 Cookie、token、签名 URL、账号或私密路径
- **THEN** 在内存提取闭合类型事实后沿原规则清理原始输出，持久摘要与实际复制文本不含秘密，同时保留能确认的诊断事实。

### Requirement: 真实安全停止

Stop SHALL 关闭提交、撤回等待工作、取消共享准备和执行，直到全部 owner 释放才报告 stopped。live shared Held 的 cleanup 在 stopping 时仍可用；owner lost 不得提供幻影 shared retry。Full/Compact、托盘隐藏/恢复和可见 Failure 的 Clear SHALL 只改变展示，不删除后台诊断历史、已交付文件或改变终态。

#### Scenario: 收起窗口或清除可见失败

- **WHEN** 用户切换 Compact、隐藏到托盘或 Clear
- **THEN** 活动队列继续受原 owner 管理；清除展示不代表取消/清理/历史删除。

### Requirement: 单任务探针共用正式队列

单任务下载探针 SHALL 使用正式队列的设置确认、冻结意图、Submit、Cancel 和 Stop；返回前 SHALL 等待真实 stopped 回执。探针设置 SHALL 隔离于用户配置。应用 MUST NOT 再打开 Stage A 独立 bridge 窗口；旧 --download-test-bridge 参数 SHALL 明确报错并指向现行 headless 探针，不能静默启动普通应用。

#### Scenario: 调用旧 bridge 参数

- **WHEN** 应用收到 --download-test-bridge
- **THEN** 非零退出，给出迁移入口且不创建窗口、队列或启动更新会话。

#### Scenario: 单任务完成或取消

- **WHEN** headless 探针提交的任务完成、失败或取消
- **THEN** 输出正式队列快照，保留唯一终态和外层 owner join 要求，并在真实停止后退出；共享准备失败也应给出失败并完成停止。

### Requirement: 任务级选项冻结

提交 SHALL 在统一队列受理边界合并已确认默认值与本任务可选画质、保存目录，完成原有输入校验后冻结到任务快照。覆盖 SHALL 不持久化或临时改写 GUI 全局设置。后续普通提交继续使用已确认默认，显式重试沿用原冻结意图。

#### Scenario: CLI 单次目录覆盖
- **WHEN** CLI 提交时选择不同画质与有效目录
- **THEN** 新任务使用该覆盖，设置文件字节和 GUI 默认不变，后续 GUI 提交继续使用原默认。

#### Scenario: 无效任务目录
- **WHEN** 提交的目录不存在或原安全校验拒绝
- **THEN** 不受理任务、不修改默认值，不以临时设置保存模拟任务覆盖。

### Requirement: 范围冻结与任务去重
受理 SHALL 校验有限非负入点及严格更大的出点，范围和唯一原生快速粗切策略与画质/目录一起冻结；可靠源时长可用时校验上界。任务去重 SHALL 区分整段、不同区间及相同区间，源身份保持原义；修改范围为新提交，显式重试沿用原范围，不切换为重编码或整段路径。

#### Scenario: 同作品不同区间
- **WHEN** 同一作品有未完成整段任务，又提交另一有效区间
- **THEN** 接受为不同任务，相同作品和相同区间的未完成任务仍拒绝重复。
