# [Report｜TRA-28 / R6｜阶段 B：常规偏好及跨窗口一致性]｜2026-11-01

**阶段 B 工程实现与必要 Agent 自测完成，待网页轻量 Review。完整人工体验验收后置 Final。TRA-28 保持 In Progress，本轮停止。** 本报告不代表网页 Review PASS、阶段 B 最终人工 PASS 或整个 Issue Done。

执行入口仅为 [R6 Instruction](https://linear.app/mabel-dev/issue/TRA-28#comment-14924c16-b9b4-4bd1-abdb-9f2d68894499)；已先核对交接、重复指示去重及现场，再写入 [Execution](https://linear.app/mabel-dev/issue/TRA-28#comment-a6d94708-b4bc-4a4d-bce4-16bbcba96616)。未重复实施 R5，未进入 C/D、T04、R7 或 Final。

## 实际交付与权威边界

- **常规页面**：开机启动、跟随系统/浅色/深色、跟随系统/简体中文/English 均接通实际状态。常规为默认页面，显示保存等待、失败及恢复反馈；保留下载、组件与诊断、关于的现有信息架构和滚动内容。
- **主题/语言持久化**：扩展既有 Settings，旧 JSON 无新增字段时默认浅色、语言跟随系统；显式选择可重启恢复。仍由 Coordinator 的 QueueCommand::SaveSettings 保存，成功落盘后才发布/ACK，失败不切换成假成功。仅展示偏好改变时不重新验证无关的下载目录；目录或画质改变仍按既有规则验证，已有 Job 的冻结目录/画质不变。
- **跨窗口一致**：主窗 Compact/Full、主菜单与画质子菜单、队列/准备/状态/动作/退出确认、设置及应用可控的现有 Shell 托盘文案共用有效偏好。语言变化更新设置窗原生标题。常见错误包含嵌套保存错误和 Windows 开机启动错误；保留用户文件名、URL、日志与诊断 payload 原文。长失败反馈可换行/滚动。
- **系统跟随**：读取 Windows AppsUseLightTheme 和 GetUserDefaultUILanguage，经现有主窗刷新约每秒重新读取；显式偏好覆盖系统。非中文系统语言 fallback English。系统语言若需注销后才对进程可见，遵循 Windows 的实际返回值。
- **登录启动**：使用当前用户 HKCU Run 单一 AmeowNext REG_SZ，登记带引号的当前 EXE 路径和 --login-startup，不引入管理员要求、服务或计划任务。状态由真实注册项读取；过期 Portable 路径显示 Stale 并可修复。读取 StartupApproved 的禁用/异常状态时明确报告并指引系统“启动应用”，不擅自改写系统批准标记；登记存在但被系统禁用时不伪称成功。
- **安静启动与防重**：Local 会话范围命名 mutex/event 保持主实例生命周期；重复登录启动静默退出，重复手动启动通知现有主窗恢复。登录入口不调用前台激活，沿用原生非激活 Compact 首次显示和 TOPMOST。mutex 使用默认 DACL，名称未增加用户 SID；跨用户/不同完整性级别组合尚未原生验证。
- 保留 R5 设置窗 TOPMOST、正文焦点追踪/标题栏原生拖动、单实例设置、既有 Shell owner 与 ExitIntent/Stop/stopped。设置窗未取得第二套 Queue/Runtime/退出权威；未实现阶段 D 自绘托盘。

## 改动与现场

唯一 Next：D:/Ameow-worktrees/tra26-r7-stage-b，分支 next/tra26-r7-stage-b，HEAD **53a7f1d0cd4c49b957f88297d289858a2f62dfb4**。相对 Instruction 旧 HEAD a48f9e98 的差异来自两项已存在的 mini-trellis 迁移提交。

R6 相关文件：ameow-next/Cargo.toml；src/download/settings.rs、queue.rs、neutral_tests.rs；src/main.rs、download_ui.rs、tray.rs、settings_window.rs、queue_fixture.rs；新增 src/login_startup.rs、ui_text.rs；examples/download_queue.rs。Cargo 仅打开既有 windows-sys Registry/Globalization features，无依赖版本或 Cargo.lock 变更。

开工已存在的 R3/R5 context_menu.rs、download_ui.rs、main.rs、settings_window.rs 产品差异和两份 journal/index 改动均保留；context_menu.rs 不是本轮新增修改。全部产品工作仍未提交。未 commit/push/merge、替换 main、搬动/归档 Trellis、销毁工作树或发布程序。

## 工程测试及独立检查

实际执行：

```text
cargo test --offline --locked --manifest-path ameow-next/Cargo.toml --all-targets -- --test-threads=1
cargo build --offline --locked --manifest-path ameow-next/Cargo.toml --bin ameow-next
```

全目标合计 **209 passed / 0 failed / 12 既有 conditional ignored**：lib 64/6、bin 124/1、其余 integration/example 合计21/5（通过/跳过）。跳过依赖既有固定资产、缓存、媒体或平台字体条件，本轮未新增跳过。覆盖旧设置兼容、偏好 round-trip、ACK/失败、Job 冻结、系统偏好解析、启动注册 scratch-key 读写/清理、命令与单实例等关键行为；scratch-key 测试不修改真实 Run 项。

最后文案/错误映射调整后，ui_text 目标测试 **2 passed**，最终二进制构建成功且无警告；新增/主要设置文件 rustfmt 通过，git -c core.whitespace=cr-at-eol diff --check -- ameow-next 通过。此前全量日志曾有增量产物 finalize 访问提示及已删除函数的 unused 警告，不能把历史日志描述成全程无警告。仓库全局普通 diff --check 指出的 journal/index CRLF 为开工已有差异，未为消除提示重写历史记录。

独立只读 reviewer 指出嵌套保存错误英文覆盖、StartupApproved 错误英文覆盖、语言切换未更新原生标题三项；均已修复并由原 reviewer 静态回读确认关闭。reviewer 没有执行原生测试；下面证据由 Lead 实测负责。

## Windows 原生 Agent 自测

使用真实生产 Coordinator、独立 R6 settings/output/TEMP/TMP/logs 和复制的固定 Runtime；未提交任何媒体任务。进程级代理指向 127.0.0.1:9，并禁用 Deno 更新检查；**这些代理不是强制网络沙箱**。运行时四项哈希与固定 Manifest 一致，组件 downloaded_bytes=0。CUA 对 GPUI canvas 输入回执不是通过证据，判断基于截图、实际设置文件和 Coordinator/native 日志。

1. **切换、持久化与失败恢复**：native01 实测默认浅色/系统中文，切换深色与 English；设置窗口/原生标题、主菜单同步。临时用 FileShare.Read 锁住 R6 自有 settings.json，触发 E_SETTINGS_SAVE，磁盘及有效 UI 保持 dark/English，英文错误完整换行可读；释放锁后重试 Light 成功。Esc 关闭设置不结束主实例，重开恢复已确认设置。离开前保存 System theme/English。
2. **最终构建重启**：native02 使用最终 EXE，正确恢复 System theme/English，设置窗英文标题正确；随后现场切换 Dark/简体中文，settings.json 为 dark/chinese，窗口标题同步。截图见下。未实际修改 Windows 全局主题或系统语言；当前 OS 读取与 System 实际显示已验证，变化组合由确定性测试覆盖。
3. **登录入口与防重复**：--login-startup 原生 hidden→TOPMOST→show 前后前台 HWND 均为2101136，无激活；主窗 TOPMOST=true。native01 主实例 PID68404 下，登录重复 PID8488、手动重复 PID73964 均 exit0，仅保留主实例；两种重复入口分别按静默/恢复路径运行。未执行真正注销/登录。
4. **安全终态**：native01 PID68404 与 native02 PID27692 均经现有 Alt-F4→Stop/stopped、jobs=[] 正常 exit0，分别于 13:44:39Z、13:50:01Z 结束。结束核对无活动 Ameow/cargo/rustc 进程。这里仅为空闲安全退出证据，未冒充真实在途 Continue/Stop。
5. **真实登录注册保护**：本轮未点击启用来污染真实开机配置；真实 Run 项前后均 null。启用/禁用/过期与失败测试使用隔离 scratch registry；因此不能据此声称真实登录全链路或非管理员账户实测通过。

最终构建：.trellis/research/tra28-r6.local/Ameow-TRA28-R6.exe，**37,154,816 bytes**，SHA256 **FBDED2DFA03DBB7363D45C42616BA4FC32105E555BCDD0884063F1954982D7C7**。这是开发诊断自测产物，非正式 Portable 发布包。

native01 中间产物另存 Ameow-TRA28-R6-native01.exe，SHA256 **EB98B0E4918A95FDB3ECF6AEB31B452B243421E6886C3A15C691BB9653A11518**；保存失败与英文菜单截图来自该中间产物，不能标为最终 EXE 截图。最终 EXE 另行完成了重启和中英文/深色切换验证。

**最终 EXE：重启恢复 System theme/English**

![TRA28-R6-final-restart-en.png](https://uploads.linear.app/b33bbec4-1501-4f52-8a93-48e3f253b4b2/5a6005ed-0b89-42ba-b994-907cf3f34921/4edca991-2a03-4b18-87de-6ac80ccba39a)

**最终 EXE：Dark/简体中文即时切换**

![TRA28-R6-final-dark-zh.png](https://uploads.linear.app/b33bbec4-1501-4f52-8a93-48e3f253b4b2/8d8a6bf0-fd37-46b8-8393-32381fbcccd7/d098c026-7c4a-43ca-9f7e-de7d025d0b07)

**中间 EXE native01：拒绝原子保存后保持已确认主题/语言，英文失败反馈可读**

![TRA28-R6-save-failure-en.png](https://uploads.linear.app/b33bbec4-1501-4f52-8a93-48e3f253b4b2/cf94c9ba-a618-4980-9687-f485d21a5e13/ea06007b-b113-4f0d-b9c8-ff131bf81a6b)

截图均按应用窗口紧裁，未用长页/空白或原始 JSON 替代可读证据。

## 保护核对与证据定位

.trellis/research/tra28-r6.local/ 保存 all-tests.log、final-text-tests.log、final-build.log、identity-final.json、native-baseline.json、protection-after.json、launch-native.ps1、native01/native02 运行记录及窗口截图。

native-baseline 是**完成主要产品实现后、原生测试前**的快照。前后14项保护检查 issues=[]：三仓 HEAD/branch/refs/index 一致，冻结 main 和扩展 status 一致；真实 Run 项保持 null。不能把此快照冒充开发前的源文件零变化证明。冻结 main HEAD d657f555afbc69c3dd3cb1340e209e611a95df1a、扩展 HEAD f7f11987bdd2931f060ada309c0f3f76dbbe91e4 未变。R5 冻结干净/观测 EXE 哈希分别仍为8DE701FB0583DB959FFA0868AEC5A2FA084DC4E02049A1D21EE3A78FBA88D15C / C8D374B7906F06BE77C84542650F536915144DC22F32764C7DA0E0483335402F。旧 ZIP/历史材料未改动，未逐份重新计算全部历史哈希。

## Final 待验收与停止点

- 真实 Windows 注销/登录自启完整链、普通/非管理员账户及不同权限组合，Portable 移动后的实际系统注册修复；本轮仅验证对应实现与隔离 registry 路径。
- 实际改变 OS 主题/语言的跟随、混合 DPI/多屏、主观视觉与完整键盘/焦点体验。R6 未原生截图现有托盘或重启 Explorer，仅完成语言接入源码检查。
- 活跃媒体下载期间切换/关闭设置不中断，以及新菜单和未来自绘托盘 Exit→Continue/Stop 的真实在途验收，遵循用户决定集中到 Final。当前未引入公共媒体或真实在途任务。
- 阶段 C/D 尚未启动，未来 GPUI 托盘的主题/语言与联动验收属于相应阶段及 Final。

请求网页按 R6 工程交付和关键风险轻量 Review；**交接状态：R6 Report 已回写 · 阶段 B 工程待网页 Review / Final 人工验收后置**。保持 In Progress，停止；不发布 R7、不进入 C/D、不标记 Done。

