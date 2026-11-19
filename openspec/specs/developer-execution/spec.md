# developer-execution Specification

## Purpose

为开发者和 Agent 提供可重复的隔离有限执行入口，复用正式任务核心，并让构建身份、场景性质、任务状态、资源结算和实际文件具备可复核的证据；避免重复工程探针的生命周期和结果语义分歧。

## Requirements

### Requirement: 显式开发门槛与完整隔离

开发执行 SHALL 仅在显式启用开发特性的 debug 构建可用，release 构建 MUST 拒绝该特性。每次执行 SHALL 要求独立数据根，固定派生配置、runtime 和 output，拒绝生产域交叠及已有运行记录，不启动桌面或生产更新服务。

#### Scenario: 普通构建拒绝开发命令
- **WHEN** 未启用开发特性的 CLI 收到 dev 命令
- **THEN** 返回明确错误，不启动应用或访问生产队列。

#### Scenario: 同根误复用
- **WHEN** 调用者选择生产数据域或已经保存开发运行记录的根
- **THEN** 拒绝执行，保留原数据与证据。

### Requirement: 有限任务与正式生命周期

真实执行 SHALL 使用正式下载核心和组件校验。开发命令持有本次任务，不接受 GUI 附着；有限多任务、取消、一次显式失败重试及停止 SHALL 遵循原队列规则。取消回执仅表示受理，只有权威终态且资源释放才表示结算。

#### Scenario: 失败后重试
- **WHEN** 启用一次失败重试且原任务结算为 Failure 或 Partial
- **THEN** 使用原重试规则并保留原任务、请求与重试身份关联。

### Requirement: 有界等待与真实未结算结果

执行 SHALL 有明确运行期限与停止宽限期。到期 SHALL 请求正式停止，Held 或 owner lost SHALL 立即输出清理未确认原因。宽限期后仍未结算 SHALL 返回非成功与 stopped=false 等真实资源状态，不能强制终止后宣称结算；外部强杀没有完整结果时 SHALL 视为未确认。

#### Scenario: 取消后 Held
- **WHEN** 取消已受理而任务进入 Held
- **THEN** 立即保存未确认清理状态；终态等待不制造 Cancelled，超时结果保留 slot 与资源事实。

### Requirement: 有界自动证据与覆盖性质

开发执行 SHALL 自动保存构建与 EXE 身份、实例/请求/任务关联、有界 JSONL、最终退出码、资源状态与实际文件核对。stdout SHALL 只包含一个机器结果，日志不得混入；默认可分享结果 SHALL 隐去域外私有路径、URL 查询与认证材料。离线合成核心场景、真实下载和原生 GUI 证据 SHALL 分别标识，不能互相冒充。

#### Scenario: 合成核心回归
- **WHEN** 执行离线固定故障场景
- **THEN** 结果明确合成 Adapter 与正式核心的覆盖，校验真实生成文件和停止资源，不宣称公网下载或原生点击通过。
