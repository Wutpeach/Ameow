---
title: 命令行与 Agent
description: 获取 Ameow CLI，从终端提交任务并读取同一桌面队列的结果。
---

`ameow-cli` 让脚本和 Agent 操作本机当前用户的 Ameow 队列，与桌面端共用任务、组件和下载结果。无需另装扩展，也没有需要开启的 GUI 设置。

## 先确认版本

**当前正式发行版 v0.5.0 不包含后加的 CLI。** 本页描述后续版本的能力；现在使用需要包含 CLI 的匹配候选完整包，或从包含该能力的源码构建。不要从 v0.5.0 下载页安装后就期待存在该命令。

普通桌面控制 CLI 已进入源码 main；开发专用的 `dev` 入口属于 [PR #61](https://github.com/Wutpeach/Ameow/pull/61) 候选。后续正式完整包才会分发这些新增能力，版本号以实际发行说明为准。

## 安装与调用

### Windows

在**包含 CLI 的完整安装包或便携包**中，`ameow-cli.exe` 与 `AmeowLauncher.exe` 位于同一目录。安装或完整解压后即可调用，保留应用目录结构。

在 PowerShell 中，将下列路径改成自己的实际安装或解压位置：

~~~powershell
$Cli = 'D:\Apps\Ameow\ameow-cli.exe'
& $Cli --help
~~~

也可自行把该目录加入用户 `PATH`，再使用 `ameow-cli --help`。安装不会自动注册全局命令或修改用户 `PATH`。从当前目录运行时使用 `./ameow-cli.exe`；上面的 `&` 是 PowerShell 调用带引号路径的语法。

### Mac

在包含 CLI 的完整 `Ameow.app` 中，入口是 `Contents/MacOS/ameow-cli`。例如应用放在 `/Applications` 时，在 zsh 或 bash 中运行：

~~~sh
cli='/Applications/Ameow.app/Contents/MacOS/ameow-cli'
"$cli" --help
~~~

若安装在 `~/Applications`，相应修改路径。可选的当前 shell 别名为：

~~~sh
alias ameow-cli='/Applications/Ameow.app/Contents/MacOS/ameow-cli'
ameow-cli --help
~~~

需要长期保留时，自行将别名加入所用 shell 的配置。Ameow 不自动安装全局命令或修改 `PATH`；请从原应用包调用，保留包内成员和签名。

## 提交并查看结果

准备一个自己要下载的公开媒体 URL。以下 PowerShell 示例会询问链接；先按上一节设置 `$Cli`：

~~~powershell
$Url = Read-Host '公开媒体 URL'
$Receipt = & $Cli --json submit $Url | ConvertFrom-Json
$Receipt
~~~

回执 `ok` 为 `true` 后，使用完整的 `task_id` 查询或等待：

~~~powershell
$Task = $Receipt.result.task_id
& $Cli --json show $Task
& $Cli --json wait $Task --timeout 300
~~~

在 Mac 的 zsh/bash 中，先按上一节设置 `cli`，再提交：

~~~sh
printf 'Public media URL: '
IFS= read -r url
"$cli" --json submit "$url"
~~~

从成功回执复制完整 `task_id`，替换下面的 `INSTANCE:JOB`；它是占位符，不能只保留数字：

~~~sh
task='INSTANCE:JOB'
"$cli" --json show "$task"
"$cli" --json wait "$task" --timeout 300
~~~

`submit` 在没有可连接实例时会启动相邻的普通应用，Windows 经过 Launcher；仍是桌面实例持有任务。其他任务和状态命令不启动应用。`--no-start` 可禁止提交时自动启动。

| 命令 | 用途 |
| --- | --- |
| `submit URL` | 提交，可选画质预设和 `--output DIR` |
| `list`、`show INSTANCE:JOB` | 列表或查看一个任务 |
| `wait INSTANCE:JOB --timeout 300` | 最多等待 300 秒，返回权威终态与实际文件 |
| `cancel INSTANCE:JOB`、`retry INSTANCE:JOB` | 取消或重试；重试后读取回执中的任务 ID |
| `settings`、`components`、`diagnose` | 读取偏好、组件状态或安全诊断；诊断可指定任务 ID |

表中的 `URL`、`DIR`、`INSTANCE:JOB` 均为占位符；URL 是否可下载由实际下载器和站点决定。画质参数为 `--quality highest`、`--quality balanced` 或 `--quality saver`；保存目录必须已存在。提交选项只影响本次任务，不改默认设置。

## 脚本需要注意

`--json` 让 stdout 只输出一个机器结果，日志不混入其中。`wait` 的退出码区分成功 0、部分成功 3、失败 4、取消 5、超时 6；其他错误和完整字段见仓库 [CLI 参考](https://github.com/Wutpeach/Ameow/blob/main/docs/cli.md)。

取消回执 `applied: true` 只表示取消意图受理。`Held` 或 `resources_released: false` 表示清理尚未确认，不能视为 Cancelled。CLI 退出、中断或等待超时不会取消桌面任务；实例重启后旧任务 ID 失效。

## 更新与源码构建

Windows 单 EXE 自动更新只更新桌面应用，CLI 随完整安装包或便携包更新。Mac CLI 随完整应用包更新并参与包签名校验。不要把一个 CLI EXE 拷到其他版本旁，也不要混装候选与正式包；协议不兼容会明确报错。

现在需要源码构建时，按[开发资料中的 CLI 入口](../developer/#cli)使用独立目录。普通控制 CLI 不要求 `dev-tools`；`ameow-cli dev` 是另一种仅 debug + `--features dev-tools` 可用的开发入口，release 构建明确拒绝该特性，正式包没有可开启它的设置开关。
