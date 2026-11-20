# Ameow CLI

[中英文用户指南与安装说明](../site/src/content/docs/docs/cli.md) · [English](../site/src/content/docs/en/docs/cli.md)。开发专用的有限无 GUI 执行和可重复场景见 [CLI 开发入口](developer-cli.md)。以下是普通桌面控制的完整调用契约。

## 版本与启用

当前正式 v0.5.0 包不包含后加的 CLI；现在需要匹配候选完整包或包含该能力的源码，后续完整正式包才会分发。普通控制 CLI 已在 main；本组合候选整合 PR #61 开发工具、PR #63 登录态与 PR #64 区间。无需另装扩展或开启 GUI 设置；安装不自动修改用户 PATH，也不注册全局命令。`dev-tools` 仅是 debug 开发构建特性，不能从正式包的设置中开启，release 构建会拒绝它。

ameow-cli 控制本机当前用户的普通 Ameow 桌面实例。任务、组件准备、下载器、取消、重试和交付均使用 GUI 的同一个队列。Windows 和 macOS 是本阶段目标；实际验收覆盖以 PR 证据为准。

## 构建与入口

在包含所需能力的独立开发目录使用同一个固定 target，先按 [CONTRIBUTING](../CONTRIBUTING.md) 安装工具链：

~~~powershell
cargo build --locked --bin ameow --bin ameow-cli --target-dir target
./target/debug/ameow-cli.exe --help
~~~

Windows 安装包/便携包中的 ameow-cli.exe 与 AmeowLauncher.exe 同目录，可将该目录加入自己的 PATH，也可直接使用绝对路径。macOS 包内入口为 Ameow.app/Contents/MacOS/ameow-cli，可用自己的 shell alias 调用。CLI 使用 console subsystem，桌面应用保持原窗口入口。

上述包内位置适用于包含 CLI 的完整包；保留 Launcher、应用版本成员与目录结构，不要把单个 CLI EXE 放到其他版本旁。Mac 源码构建使用相同 Cargo 命令，在 zsh/bash 运行 `./target/debug/ameow-cli --help`，路径不带 `.exe`。Windows PowerShell 调用带引号的绝对路径时使用 `& '实际路径/ameow-cli.exe' --help`。

Windows 应用自动更新仍使用原单 EXE 更新包，只更新桌面应用；CLI 随完整安装包/便携包更新。协议版本不兼容时明确报错。macOS CLI 是应用包成员，纳入完整包签名与更新校验。

## 常用命令

~~~powershell
$Url = Read-Host '公开媒体 URL'
$Output = Read-Host '已存在的保存目录'
ameow-cli --json submit $Url
ameow-cli --json submit $Url --quality saver --output $Output
ameow-cli --json list
ameow-cli --json show INSTANCE:JOB
ameow-cli --json wait INSTANCE:JOB --timeout 300
ameow-cli --json cancel INSTANCE:JOB
ameow-cli --json retry INSTANCE:JOB
ameow-cli --json settings
ameow-cli --json sessions
ameow-cli --json components
ameow-cli --json diagnose INSTANCE:JOB
ameow-cli --json diagnose
~~~

--quality 为 highest、balanced、saver，语义与 GUI 一致。--output 必须指向已存在且符合原队列校验的目录；相对路径按调用 CLI 的工作目录解析。选项只覆盖本次任务，不修改 GUI 默认。重试沿用原冻结意图。

提交在没有控制实例时默认启动相邻的普通应用；Windows 优先走稳定启动器。--no-start 禁止启动，--app PATH 可选择确切开发入口。启动不会额外激活/恢复窗口，窗口仍遵守原应用规则。其他命令在没有实例时返回连接错误。握手等待应用 owner 接受，组件准备继续走既有共同流程。

CLI 退出、Ctrl+C、等待超时与失联均不取消任务。取消必须显式执行 cancel。wait 直到权威终态且资源结算后返回结果；GUI 普通重试可能创建新 ID，原失败 ID 仍表示原任务，Gallery 续作可能保持同 ID。

`cancel` 返回 `applied: true` 表示取消意图已受理，不表示资源已经结算。`show` 仍可能返回 `Held`（清理未确认）且 `resources_released: false`；`wait` 此时继续等待或按明确的超时退出 6，不能将该回执当作 `Cancelled`。macOS 在已观察到 fork、取消后无法证明后代结算时沿用此守卫；CLI 与 GUI 读取同一状态。

## 机器结果

--json 可放在命令前后。stdout 只包含一个 JSON 结果，不含人读日志；错误也输出 JSON。成功 envelope 为：

~~~json
{"protocol_version":1,"request_id":"a_random_request_key","instance_id":"a_random_instance_identity","ok":true,"result":{"task_id":"a_random_instance_identity:1","job_id":1},"error":null}
~~~

每个成功连接 owner 的机器结果还包含顶层 client 与 owner：client.version 是 CLI 自身版本；owner.instance_id、pid、app_version、protocol_version、startup_pending、commands_allowed 和 capabilities 来自当次 Hello。两个版本相同不能证明两个二进制相同；本候选 owner 未提供精确构建 hash，owner.build_hash 为 "unknown"。旧 owner 未提供的能力为 null，明确不支持为 false；不能把缺失推断为支持。components 可以在启动中读取这份摘要和真实 preparation，不自动启动或等待另一个实例。

show / wait 保留 task_id、原 job_id、revision、attempt、phase、冻结的 accepted.intent、进度、失败、resources_released 与 files。files 中的 path、bytes、sha256 来自业务 owner 的已交付记录，包含取消/部分成功时已经交付的集合文件。客户端自动取完有界任务/文件页；不输出下载器原始 stderr，不把百分比当完成。活动查询页面期间任务仍可变化，list 的 consistent 表示跨页 revision 是否一致；跨文件页变化返回 E_SNAPSHOT_CHANGED，可重新查询。终态结算后文件结果稳定。

| 退出码 | 意义 |
| --- | --- |
| 0 | 操作成功；等待完整下载成功或 metadata-only 的 Inspected |
| 2 | 参数或请求不合法 |
| 3 | 等待部分成功，检查 files |
| 4 | 等待失败 |
| 5 | 等待取消 |
| 6 | 等待超时，任务继续 |
| 7 | 无控制实例、失联、连接或启动超时 |
| 8 | 协议错误或版本不兼容 |
| 9 | 业务拒绝、任务不存在、旧实例 ID、访问或容量限制等；读取 error.code |

稳定类别包括 E_NOT_RUNNING、E_DISCONNECTED、E_CONNECTION_TIMEOUT、E_LAUNCH_TIMEOUT、E_ACCESS_DENIED、E_PROTOCOL_VERSION、E_INVALID_REQUEST、E_INVALID_TASK_ID、E_TASK_NOT_FOUND、E_INSTANCE_CHANGED、E_APP_UPDATE_BUSY、E_REQUEST_REJECTED、E_REQUEST_CONFLICT、E_REQUEST_LIMIT、E_SNAPSHOT_CHANGED、E_WAIT_TIMEOUT。业务拒绝细节在 error.message，调用者应按 code 分支。组件状态及安全诊断可辅助判断；首期没有组件/应用更新或全局设置写命令。

## 回执丢失与身份

每个任务 ID 都带随机实例身份。重启后原任务历史不恢复，旧 ID 返回 E_INSTANCE_CHANGED；不能去掉实例部分改用数字 ID。

写请求失败回执保留请求键和实例身份。如果请求可能已受理但失联，可向**同一实例**显式重放完全相同的命令：

~~~powershell
ameow-cli --json --request-id ORIGINAL_REQUEST_KEY --instance-id ORIGINAL_INSTANCE_ID submit $Url
~~~

同键同内容返回原回执；同键不同内容拒绝。CLI 不自动跨实例重放。请求键为 8–80 位 ASCII 字母、数字、-、_；实例 ID 为原回执的 32 位十六进制。相对目录重放仍应解析为原绝对目录。

每个桌面会话最多保留 1024 个 CLI 写请求回执，包含拒绝、取消与重试；达到上限返回 E_REQUEST_LIMIT，读取和 GUI 操作继续可用。回执不淘汰，防止旧请求重新执行。不要为刷新额度在任务运行时强制重启；原安全停止和会话历史边界仍有效。

## 隔离验证

--instance-root 是完整隔离域：应用侧固定派生 runtime/、settings.json、output/，拒绝混入其他路径或与生产 runtime/安装目录相交。该实例不创建生产更新会话。自动启动隔离实例需要 --app 指向直接开发应用，不使用已安装版本或稳定启动器。

~~~powershell
$Url = Read-Host '公开媒体 URL'
./target/debug/ameow-cli.exe --json --instance-root D:/AmeowCliTest --app ./target/debug/ameow.exe submit $Url
./target/debug/ameow-cli.exe --json --instance-root D:/AmeowCliTest list
~~~

测试数据与 warm cache 放在该域；不得复制或改写其他任务的 app/target。本树构建使用固定 target，证据使用 ignored evidence/。Windows named pipe 限制当前用户 DACL 并核验服务端用户；macOS socket 位于受保护短路径目录并核验双方 UID。没有 TCP/HTTP 或远程服务。

仅为本地包内验入，现有 `app-update-fixture` 特性（release 编译禁止）支持隔离启动测试安装布局：Windows 从相邻 `AmeowLauncher.exe` 启动，核验公共 RFC fixture 签名与 Launcher/CLI 字节，Launcher 与应用共用该域的唯一实例锁，并继续等待真实 Ready/accepted；不能用生产包替代 fixture。macOS 可从私有 `Ameow.app/Contents/MacOS/ameow-cli` 启动相邻应用。两端仍强制隔离 runtime/settings/output，停用生产更新服务，不读生产私钥或连接日常实例。正式构建仍要求上述直接开发入口。

## macOS 最小复验

由本功能独立验证树检出 PR 的精确实现提交，不写 0.5.0 固定树。构建 app、CLI、updater；在长路径的独立实例根验证两个并发提交只建立一个桌面 owner，CLI/GUI 同任务可见，双向取消/重试，真实交付、等待超时/中断、旧 ID 拒绝，以及默认未被任务目录覆盖。核验 socket 当前用户权限和同根重绑；构建应用包时核对 CLI arm64、最低系统版本与完整包签名。Windows 结果不能替代 Mac 验证。

## 开发只解析

仅 debug + dev-tools 的 CLI 和 owner 支持。该能力需要明确实例身份；使用既有 components 输出中的 owner.instance_id。省略 --instance-root 时选择当前用户的默认 owner；传入它则选择已有的隔离运行域。两者都必须已经运行，命令不自动启动应用，身份不匹配则提交前拒绝。详见 [开发指南](developer-cli.md#使用现有-owner-只解析)。

只解析返回同一队列的实例绑定 task_id。使用 show / wait / cancel 观察和控制；Inspected 且 resources_released=true 仅表示解析与清理完成，files 为空，不代表下载或成品验证。其 accepted 为 null，quality 保留本次冻结选择；inspection 包含已验证 site/id/part、未知为 null 的时长与最多八条所选媒体测量。标题留空，原始 JSON、URL、格式 ID、headers 和凭据不进入摘要。大小的 native_filesize 与 native_estimate 来源明确区分，不能据此承诺网络总量或未来 transfer 选择。

如 inspection 进入 Held，cancel 仍只受理取消意图；使用现有 retry TASK_ID 请求该任务的正式清理重试，再 wait。该响应标记 cleanup_retry=true，沿用同一任务 ID，不重新解析、不下载。Failure 后再次解析需显式新建 inspect，不用普通下载 retry。旧 owner 返回 E_INSPECTION_UNSUPPORTED；启动中返回 E_STARTING，不静默换实例。
