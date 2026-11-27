# Ameow CLI

[中英文用户指南与安装说明](../site/src/content/docs/docs/cli.mdx) · [English](../site/src/content/docs/en/docs/cli.mdx)。开发专用的有限无 GUI 执行和可重复场景见 [CLI 开发入口](developer-cli.md)。以下是普通桌面控制的完整调用契约。

## 版本与启用

使用包含 CLI 的匹配完整包或当前 main 源码。无需另装扩展或开启 GUI 设置；安装不自动修改用户 PATH，也不注册全局命令。`dev-tools` 仅是 debug 开发构建特性，不能从正式包的设置中开启，release 构建会拒绝它。

ameow-cli 控制本机当前用户的普通 Ameow 桌面实例。任务、组件准备、下载器、取消、重试和交付均使用 GUI 的同一个队列。Windows 和 macOS 的实际验收覆盖以对应构建的验证记录为准。

## 构建与入口

在包含所需能力的独立开发目录使用同一个固定 target，先按 [CONTRIBUTING](../CONTRIBUTING.md) 安装工具链：

~~~powershell
cargo build --locked --bin ameow --bin ameow-cli --target-dir target
./target/debug/ameow-cli.exe --help
~~~

Windows 安装包/便携包中的 ameow-cli.exe 与稳定入口 Ameow.exe 同目录，可将该目录加入自己的 PATH，也可直接使用绝对路径。macOS 包内入口为 Ameow.app/Contents/MacOS/ameow-cli，可用自己的 shell alias 调用。CLI 使用 console subsystem，桌面应用保持原窗口入口。

上述包内位置适用于包含 CLI 的完整包；保留 Launcher、应用版本成员与目录结构，不要把单个 CLI EXE 放到其他版本旁。Mac 源码构建使用相同 Cargo 命令，在 zsh/bash 运行 `./target/debug/ameow-cli --help`，路径不带 `.exe`。Windows PowerShell 调用带引号的绝对路径时使用 `& '实际路径/ameow-cli.exe' --help`。

0.5.2 起 Windows 完整便携包也是应用内更新载荷，CLI 随完整应用更新。协议版本不兼容时明确报错。macOS CLI 是应用包成员，纳入完整包签名与更新校验。

## 常用命令

~~~powershell
$Url = 'https://example.com/media' # 换成实际媒体 URL
$Output = 'D:/Downloads' # 已存在的保存目录
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

提交在没有控制实例时默认启动相邻的普通应用；0.5.3 开发版的媒体查询也可启动。Windows 优先走稳定启动器。--no-start 禁止启动，--app PATH 可选择确切开发入口。启动不会额外激活/恢复窗口，窗口仍遵守原应用规则。其他命令在没有实例时返回连接错误。握手等待应用 owner 接受，组件准备继续走既有共同流程。

CLI 退出、Ctrl+C、等待超时与失联均不取消任务。取消必须显式执行 cancel。wait 直到权威终态且资源结算后返回结果；GUI 普通重试可能创建新 ID，原失败 ID 仍表示原任务，Gallery 续作可能保持同 ID。

`cancel` 返回 `applied: true` 表示取消意图已受理，不表示资源已经结算。`show` 仍可能返回 `Held`（清理未确认）且 `resources_released: false`；`wait` 此时继续等待或按明确的超时退出 6，不能将该回执当作 `Cancelled`。macOS 在已观察到 fork、取消后无法证明后代结算时沿用此守卫；CLI 与 GUI 读取同一状态。

## 机器结果

--json 可放在命令前后。stdout 只包含一个 JSON 结果，不含人读日志；错误也输出 JSON。成功 envelope 为：

~~~json
{"protocol_version":1,"request_id":"a_random_request_key","instance_id":"a_random_instance_identity","ok":true,"result":{"task_id":"a_random_instance_identity:1","job_id":1},"error":null}
~~~

每个成功连接 owner 的机器结果还包含顶层 client 与 owner：client.version 是 CLI 自身版本；owner.instance_id、pid、app_version、protocol_version、startup_pending、commands_allowed 和 capabilities 来自当次 Hello。两个版本相同不能证明两个二进制相同；当前 owner 未提供精确构建 hash，owner.build_hash 为 "unknown"。旧 owner 未提供的能力为 null，明确不支持为 false；不能把缺失推断为支持。components 可以在启动中读取这份摘要和真实 preparation，不自动启动或等待另一个实例。

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

稳定类别包括 E_NOT_RUNNING、E_DISCONNECTED、E_CONNECTION_TIMEOUT、E_LAUNCH_TIMEOUT、E_ACCESS_DENIED、E_PROTOCOL_VERSION、E_INVALID_REQUEST、E_INVALID_TASK_ID、E_TASK_NOT_FOUND、E_INSTANCE_CHANGED、E_APP_UPDATE_BUSY、E_REQUEST_REJECTED、E_REQUEST_CONFLICT、E_REQUEST_LIMIT、E_SNAPSHOT_CHANGED、E_WAIT_TIMEOUT。业务拒绝细节在 error.message，调用者应按 code 分支。组件状态及安全诊断可辅助判断；维护操作的受理与实际完成必须分开判断。

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
$Url = 'https://example.com/media' # 换成实际媒体 URL
./target/debug/ameow-cli.exe --json --instance-root D:/AmeowCliTest --app ./target/debug/ameow.exe submit $Url
./target/debug/ameow-cli.exe --json --instance-root D:/AmeowCliTest list
~~~

测试数据与 warm cache 放在该域；不得复制或改写其他任务的 app/target。本树构建使用固定 target，证据使用 ignored evidence/。Windows named pipe 限制当前用户 DACL 并核验服务端用户；macOS socket 位于受保护短路径目录并核验双方 UID。没有 TCP/HTTP 或远程服务。

仅为本地包内验入，现有 `app-update-fixture` 特性（release 编译禁止）支持隔离启动测试安装布局：该历史 Windows fixture 使用相邻 `AmeowLauncher.exe`，核验公共 RFC fixture 签名与 Launcher/CLI 字节，Launcher 与应用共用该域的唯一实例锁，并继续等待真实 Ready/accepted；不能用生产包替代 fixture。macOS 可从私有 `Ameow.app/Contents/MacOS/ameow-cli` 启动相邻应用。两端仍强制隔离 runtime/settings/output，停用生产更新服务，不读生产私钥或连接日常实例。正式构建仍要求上述直接开发入口。

## macOS 最小复验

在独立验证树检出待验证的准确提交，避免影响日常开发目录。构建 app、CLI、updater；在长路径的独立实例根验证两个并发提交只建立一个桌面 owner，CLI/GUI 同任务可见，双向取消/重试，真实交付、等待超时/中断、旧 ID 拒绝，以及默认未被任务目录覆盖。核验 socket 当前用户权限和同根重绑；构建应用包时核对 CLI arm64、最低系统版本与完整包签名。Windows 结果不能替代 Mac 验证。

## 正式媒体查询与切片（0.5.3 开发版）

以下能力属于 0.5.3 开发版，需要匹配的 CLI 和桌面 owner；已发布的 0.5.2 包不提供这些新增命令。正式发布前请使用本树帮助和构建确认实际能力。

以连接结果中的 `owner.capabilities` 判断支持情况。查询结果的 `duration_seconds` 和 `selected` 中的测量字段在未知时为 `null`；`selected` 是对应画质预设选中的来源规格摘要，其中 `video_codec` 表示来源编码，`bytes` / `size_source` 表示来源大小或估计。最终成品的路径、字节数和 SHA-256 读取结算后的 `files`。快速切片可能包含附近关键帧边界，需要更贴合指定时间时使用 `--precise`。

~~~powershell
$Cli = 'D:/Apps/Ameow/ameow-cli.exe'
$Url = 'https://example.com/media' # 换成实际可访问的作品链接
$Info = & $Cli --json inspect $Url --quality balanced | ConvertFrom-Json
& $Cli --json wait $Info.result.task_id --timeout 300
if ($LASTEXITCODE -ne 0) { throw "媒体查询未成功结算" }
$Job = & $Cli --json submit $Url --quality balanced --output 'D:/Downloads' --start-ms 10000 --end-ms 30000 | ConvertFrom-Json
& $Cli --json wait $Job.result.task_id --timeout 300
# 如需精确切片，提交时同时使用 --start-ms、--end-ms 与 --precise
~~~

`inspect` 返回任务 ID；其终态 `Inspected` 且 `resources_released: true` 才表示解析和清理完成，`inspection` 是安全摘要，未创建文件。媒体信息和所选规格来自实际解析，不能保证之后下载成功。它可能联网、准备组件和使用已有浏览器授权，但不导出凭据。`--quality` 省略时查询使用 highest。提交的质量与目录默认取已保存值；两个时间参数是毫秒，默认快速切片，精确切片需加 `--precise`。

## 偏好与维护（0.5.3 开发版）

先读取当前偏好和会话状态；仅在需要修改默认值时执行 `settings set`：

~~~powershell
& $Cli --json settings
& $Cli --json sessions
~~~

~~~powershell
& $Cli --json settings set quality balanced
& $Cli --json settings wait --timeout 30
~~~

组件先检查并等待，读取每项真实检查结果：

~~~powershell
& $Cli --json components check
& $Cli --json components wait --timeout 60
& $Cli --json components
~~~

仅在检查成功、存在可安装的新版本时更新对应组件：

~~~powershell
& $Cli --json components update yt-dlp
& $Cli --json components wait --timeout 300
~~~

恢复推荐版本用于恢复场景，按需要单独执行：

~~~powershell
& $Cli --json components restore yt-dlp
& $Cli --json components wait --timeout 300
~~~

应用也先检查、等待并读取状态：

~~~powershell
& $Cli --json app status
& $Cli --json app check
& $Cli --json app wait --timeout 60
& $Cli --json app status
~~~

仅当检查结果提供可安装的新版本时下载；下载完成后再次读取阶段：

~~~powershell
& $Cli --json app download
& $Cli --json app wait --timeout 300
& $Cli --json app status
~~~

只有应用更新阶段为 `Ready` 时安装。安装会正常重启应用，保留回执身份来等待实际结果：

~~~powershell
$Install = & $Cli --json app install | ConvertFrom-Json
if (-not $Install.ok) { throw $Install.error.message }
& $Cli --json --instance-id $Install.instance_id --operation-id $Install.result.operation.id app wait --timeout 300
~~~

`settings set` 修改持久偏好，先使用 `settings` 查看当前值；提交的 `--quality` 和 `--output` 仅影响对应任务。可用键包括 `quality`（highest/balanced/saver）、`output_dir`（已存在的绝对目录）、`theme`（system/light/dark）、`language`（system/chinese/english）、`tray_icon`（follow_appearance/ameow_blue/apricot）、`shortcut`、`auto_update`、`notify_updates` 和 `login_startup`。应用更新偏好保存是异步的：观察 `settings` 的保存状态、错误和 operation；隔离实例不允许更改系统启动注册。

`owner.installed_version` 只在正规更新会话可确认已接受的安装记录时提供版本；开发实例为 `null`。安装等待会同时核对新的 owner、应用版本和该安装版本，连接断开不表示成功。

`sessions` 只显示状态和缺失条件，请在浏览器中沿现有授权流程操作。组件检查可选择 `yt-dlp` 或 `gallery-dl`，不传名称时检查两者；更新与恢复须指定组件。先成功检查并确认存在可安装的新版本，再请求更新。每次操作后查询 `components` 或 `app status`，以各自真实阶段、版本和错误判断结果。`app quit`、`app restart` 使用桌面既有停止规则；进行中任务和资源遵循桌面安排。受理、等待、失联及完成是不同结果，失联本身不证明退出或安装完成。

使用 `ameow-cli --help`、`ameow-cli help submit` 或 `ameow-cli components --help` 查询实际命令参数、错误和恢复方式。

异步偏好保存可用 `settings wait --timeout 30` 确认。维护回执包含 `operation.id`、`action`、`phase`、`done`、`success` 和 `error`；只有 `done: true` 且 `success: true` 才表示完成。等待失败退出 4，超时退出 6，操作继续。

`app install`、`app quit` 和 `app restart` 需保留原回执的 `instance_id` 与 `operation.id`；原 owner 退出后，用 `--instance-id ORIGINAL_INSTANCE --operation-id OPERATION_ID app status` 查询，或配合 `app wait --timeout 300` 等待。安装核对实际接受的安装版本，重启核对新 owner 握手，退出核对进程结束。安装和退出/重启分别仅保留最近一份回执，新操作替换旧回执；超时或缺失回执仍表示结果未确认。
