# [Report｜TRA-28 / R7｜阶段 C：下载引擎信息、只读上游检查与组件诊断]

2026-11-01。阶段 C 功能开发、必要 Agent 自测及最终构建完成；等待工程 Review，完整人工体验验收集中 Final。

**交付位置变更：用户在收尾时明确要求先不要回写 Linear，等待通知新的平台。本文仅为本地待交付报告；未发布 R7 Report、未上传本轮截图、未更新 Linear 交接头或状态。** 此前已经写入的 R7 Execution 保留，不重复执行。用户通知目的地后再交付，不自动进入下一阶段。

## 指示与续接核对

- 唯一有效 Instruction：[TRA-28 / R7 阶段 C](https://linear.app/mabel-dev/issue/TRA-28#comment-52a7f3ae-7326-4cb1-8739-ce6935d67b39)。开工核对无既有 R7 Execution/Report，R6 已获[网页工程 Review PASS](https://linear.app/mabel-dev/issue/TRA-28#comment-9758544c-f48a-4b4b-82bd-4d41a604f228)。收尾再次读取，R7 仍有效且无重复 Report。
- 本轮已存在的 [R7 Execution](https://linear.app/mabel-dev/issue/TRA-28#comment-cc54208e-0212-4f38-8253-64a66cb76722) 是本次执行登记，不是另一个任务。
- 唯一 Rust Next：`D:/Ameow-worktrees/tra26-r7-stage-b`，`next/tra26-r7-stage-b`，HEAD `53a7f1d0cd4c49b957f88297d289858a2f62dfb4`。本轮及 R3–R6 产品差异均未提交，原 journal/index 与 R6 本地报告保留。

## 完成能力及权威边界

1. 独立设置中心的「组件与诊断」页落地；复用 R6 主题、语言、滚动面板和设置窗生命周期。下载引擎仅显示实际接入的 yt-dlp，依赖显示 Deno 和同一受管组合的 FFmpeg/ffprobe。
2. 区分 Manifest 固定版本与本机核验身份。身份只由既有准备流程成功完成、准备 lease 加入后发布；准备中、失败、Held、owner lost、stopping/stopped 时清除或隐藏旧成功身份。不会仅凭文件存在标记可用。
3. 「本机核验」准确含义为受管文件 SHA-256 核验与有界本地版本探测匹配预期文本。展示该流程确认的固定身份，未新增对版本 stdout 的独立解析，不声称任意可执行文件的实时版本检测。
4. 用户手动点击才查询官方 `https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest`，只接受非 draft、非 prerelease 的合法稳定日期标签，兼容官方历史正数 patch 后缀。显示结果、UTC 检查时间与相对时间，明确上游版本未经 Ameow 验证，检查不会安装或替换组件。
5. DownloadUi 持有共享 checker，设置关闭不会重建查询状态。单个只读 worker、5 秒冷却、旧结果不能覆盖新操作；fixture 无法触发真实查询。未新建 Runtime/Job/lease 或队列 authority。
6. 复用 RetryPreparation 和 CopyPreparationDiagnostic。UI 与后端使用一致重试条件，要求 Failed 且无准备、Held、owner lost、停止、待处理请求或活跃槽位；操作共用 pending 状态。系统剪贴板实际写入后才提示复制成功。
7. 复制内容使用封闭错误类别、阶段及所有权布尔值，最多 4096 UTF-8 bytes；不含原始错误、媒体 URL、Cookie、授权头、代理凭据或本机私密路径。上游错误使用安全枚举及 HTTP 状态，不透传服务器/代理原始错误。

本轮产品文件：新增 `ameow-next/src/download/upstream.rs`、`settings_components.rs`；增量更新 `download/mod.rs`、`download/queue.rs`、`download_ui.rs`、`queue_fixture.rs`、`settings_window.rs`。没有本轮 Cargo.toml/Cargo.lock/Manifest 改动、依赖升级、运行时替换或下载启动参数变更。

## 网络边界与已知限制

- 使用既有 Windows 当前路由解析，不隐式回退、不采用 reqwest 环境代理猜测、不跟随重定向。连接上限 5 秒，HTTP 上限 15 秒并受剩余总预算限制，响应体上限 256 KiB，总可见预算 30 秒。
- **Windows 同步路由解析不可强制取消。** 30 秒后 UI 结束 loading 并显示超时；实际 worker 未返回时保留单槽、禁止新请求，提示前次检查仍在结束。迟到结果丢弃，路由返回且预算耗尽后不再发 HTTP。不能称底层线程/OS 调用可在 30 秒硬取消。
- 已覆盖路由、连接、网络、HTTP、超时、无效和过大响应反馈。未诱发实际 PAC/OS 路由永久挂起；此边界由确定性 deadline 测试及源码检查支持。

## Agent 测试及构建

最终命令：

```text
cargo test --offline --locked --manifest-path ameow-next/Cargo.toml --all-targets -- --test-threads=1
cargo build --offline --locked --manifest-path ameow-next/Cargo.toml --bin ameow-next
git -c core.whitespace=cr-at-eol diff --check -- ameow-next
```

- **220 passed / 0 failed / 12 既有 conditional ignored**。各目标 passed/failed/ignored：72/0/6、127/0/1、9/0/3、1/0/2、2/0/0、9/0/0、0/0/0、0/0/0。日志 `tra28-r7.local/final-tests.log`。
- 覆盖核验身份清除、失败/不确定/清理优先级、重试 gating、敌意诊断脱敏；稳定日期/patch、体积限制、本地 HTTP 成功/403/429/redirect、离线连接失败、超时、格式变化、重复查询/clone 单槽/失败恢复/迟到丢弃；UI 中英文错误与时间、复制完成反馈、fixture 禁止真实查询。
- 最终构建成功，无警告，见 `final-build.log`。早期中间构建曾有 incremental 文件 access denied 警告，最终构建未复现，不将全部历史日志概括为无警告。
- 新模块及设置窗定向 rustfmt 检查、最终 diff whitespace 检查通过；没有批量改写已有脏文件的格式。独立只读 reviewer 完成审查与修复后复核；不替代网页 Review 或用户验收。

## 最终 EXE 原生自测

设置、输出、日志、TEMP/TMP 和 runtime 副本均在任务 `tra28-r7.local/` 内，无真实媒体任务。进程环境代理设为 `127.0.0.1:9`，但这不是网络沙箱；手动上游检查按产品设计使用 Windows 当前路由，确实发生一次官方访问。

| 场景 | 实际结果 |
| --- | --- |
| Ready，PID 26060 | 设置窗成功打开；浅色中文显示 Ready、yt-dlp 固定/本机核验身份 `2026.08.19`，Deno `2.9.7`、FFmpeg/ffprobe `N-127264-gf5d4fd186c-20261009` 可滚动查看。 |
| 真实手动上游检查 | 点击一次，官方响应稳定版 `2026.10.26`；完成 `2026-11-01 14:34:42 UTC`，`checked_at_ms=1793543682525`。未下载、安装、切换或核验该上游版本。 |
| Ready 安全操作 | 重试禁用；真实诊断复制成功，保存摘要 615 bytes（含文件换行），仅包含安全状态与历史。 |
| 外观/语言 | 同一设置窗切换深色和 English，真实设置保存命令完成；组件页英文状态与上游结果保留，可滚动/换行。未做完整键盘矩阵。 |
| 任务存储失败，PID 73656 | runtime-root 指向任务创建的普通文件，安全触发 cache/storage 失败，无组件下载；页面显示失败、本机尚未验证。此方法不是实际非管理员权限测试。 |
| 失败手动重试 | 一次真实 retry-preparation 获 applied；attempt 1→2，请求期间 retry_allowed=false，失败后恢复 true；无重复执行证据。 |
| 失败诊断复制 | 系统剪贴板实际写入并读回，583 bytes（含文件换行）；包含两次 storage 失败、建议及所有权布尔值，无 URL/本机路径/凭据。 |
| 退出 | 两次设置窗 Esc 关闭后，从主窗 Alt+F4 进入既有 Stop/stopped，正常 exit 0；最终 active_slots=0、unfinished=0、核验身份清空、重试关闭。结束时无本轮产品/cargo/rustc 活动进程。 |

Ready 结束 `14:38:49.598 UTC`，失败运行结束 `14:41:37.871 UTC`，均早于 600000ms 保险退出。日志在 `ready-final/`、`failure-final/`；空队列退出不能替代真实在途 Job/lease 的人工验收。

**一次中间构建崩溃已修复并保留证据**：native00 设置窗构造重入读取正在更新的主 Entity，报 `cannot read ameow_next::Prototype while it is already being updated`，exit `-1073740791`。修复为通过既有 Projection 传入共享 checker，不在构造函数重读主 Entity。之后重新完成全部测试、构建，以最终 EXE 实际成功打开设置、自测及正常退出。`ready/` 日志和 `Ameow-TRA28-R7-native00-crash.exe` 保留，不将该次记作 PASS。

## 构建身份与现场保护

- 最终 `tra28-r7.local/Ameow-TRA28-R7.exe`：**37,300,224 bytes**，SHA256 **50164EA2FBB4FC30DFA733BAE15116599581D1A00C19C00F2A7D3717E3F6BAFC**；与当前 `target/debug/ameow-next.exe` 相同。这是 Agent 自测构建，不是新 Portable 发行包。
- 崩溃中间 EXE：SHA256 `CF00BA8419E0BBD0A4195C009AF6DDAF30F8DD49BD91DD4FFC059F53806FC90F`，仅留作失败证据。R6 最终 EXE 仍为 `FBDED2DFA03DBB7363D45C42616BA4FC32105E555BCDD0884063F1954982D7C7`、37,154,816 bytes。
- 三仓 HEAD/branch/refs/index 与开工一致，冻结 Electron 与扩展 status 一致，共 14 项通过。冻结 Electron HEAD `d657f555afbc69c3dd3cb1340e209e611a95df1a`，扩展 HEAD `f7f11987bdd2931f060ada309c0f3f76dbbe91e4`。
- 既有源文件 SHA 对照仅出现 R7 预期变更；Cargo.toml/Cargo.lock/Manifest 与开工字节相同。任务四个受管 EXE 哈希前后一致；真实 HKCU Run 的 `AmeowNext` 项仍为空，R7 未操作开机启动注册。
- `tra28-r7.local/protection-after.json` 保存对照、退出及最终产物/源文件哈希。未重新哈希全部历史 ZIP；旧包与工作树未搬动/清理，未 commit/push/merge/release/archive。

## 实际裁图及证据入口

以下实际窗口紧裁图均未上传：

- [官方检查成功，浅色中文](tra28-r7.local/upstream-success-zh.png)
- [深色 English 组件页](tra28-r7.local/components-dark-en.png)
- [受管依赖与本机身份](tra28-r7.local/dependencies-zh.png)
- [存储失败与尚未核验](tra28-r7.local/components-failed-zh.png)
- [失败诊断复制](tra28-r7.local/failure-copied.png)

证据根 `D:/Ameow-worktrees/tra26-r7-stage-b/.trellis/research/tra28-r7.local/`；保留 `baseline.json`、`runtime-before.json`、`protection-after.json`、`final-tests.log`、`final-build.log`、`launch-native.ps1` 及各运行目录。

## Final 待验与停止状态

完整用户人工体验验收尚未进行；真实媒体在途 Job/lease、Continue/Stop、普通账户权限、真实 PAC/OS 路由挂起、混合 DPI/多屏、完整键盘/焦点及主观视觉矩阵仍待 Final。确定性测试、Agent 原生自测与历史用户 PASS 分别按实际证据等级保留。

**本轮本地工程完成，等待用户通知新的报告平台。Linear 保持原状及 In Progress，不发布 Report 或更新交接；尚未获得 R7 网页 Review PASS。停止，不进入 D/T04/Final，不发布 R8，不标记 Done。**
