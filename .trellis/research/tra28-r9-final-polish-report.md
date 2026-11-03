# Report｜R9｜Final UI/UX Polish 与 B9 修复

2026-11-02（Asia/Shanghai）。按 [R9 Instruction](https://github.com/Wutpeach/Ameow/issues/15#issuecomment-6568407535) 完成开发、必要工程测试和 Windows 原生自测。**等待网页 Review 与用户针对性验收；Issue 保持 Open，不宣告 Final PASS/Done。**

## 工作现场与范围

- 唯一 Rust Next 工作树：`D:/Ameow-worktrees/tra26-r7-stage-b`，分支 `next/tra26-r7-stage-b`，HEAD `53a7f1d0cd4c49b957f88297d289858a2f62dfb4`。开工已核对 Issue 当前要求、全部 worktree、进程和未提交差异；交付前复查未出现替代 R9 的后续指令。
- R3–R8 未提交差异保留。本轮相对开工快照仅修改四个产品文件：`settings_window.rs`、`settings_components.rs`、`tray_popup.rs`、`download_ui.rs`。`main.rs`、Shell tray、队列内核、设置持久化、网络查询实现、Manifest 和运行时管理未改变。
- Next、冻结 Electron 与扩展的 HEAD/branch/refs/index 共 12 项，加 Electron/扩展 status 两项，14 项保护对照全一致；产品文件哈希对照仅上述四个变化。证据：`tra28-r9.local/protection-final.json`。
- 沿用当前 `ameow-next/target/debug/ameow-next.exe` 和原有本机受管 Runtime；没有制作隔离应用、Portable、复制 EXE/Runtime 或创建新 worktree。结束无 Ameow/cargo/rustc 活动实例，原用户设置字节已恢复、启动注册项仍为原先不存在。

## 实际改动

**设置中心**统一为随现有 Light/Dark Palette 变化的轻量分组、48px 顶栏、24px 内容边距、18px 页面标题和约 50px 列表行。关闭入口减轻，四页导航、单实例、拖动/置顶、独立滚动和已有设置保存/ACK 路径保留。

- 常规仅三行：真实开机启动 Switch，主题与语言锚定下拉。下拉标记当前值，支持上下键/Enter、Esc 和外点收起；不常驻保存成功及功能副标题。
- 下载为路径、打开、更改的紧凑组，不重复画质。长路径按 Unicode 字符安全中段省略；完整路径悬停可见，点击或 Enter/Space 实际复制，成功提示三秒后消失。选择目录继续使用原 SaveSettings 验证/ACK；不修改旧 Job 冻结目录。
- 组件默认三行：yt-dlp、Deno、FFmpeg / ffprobe。仅 yt-dlp 有操作入口；版本仅来自 Ready 且无 preparing/held/owner-lost/stopping/stopped 的 Coordinator 已验证快照。未用 Manifest 期望值冒充本机可用版本。
- 按需展开 yt-dlp 检查操作、上游稳定版本与检查时间；诊断独立轻量组，保留脱敏复制和权威状态允许时的安全重试，复制成功提示两秒后消失。删除正常态常驻的「本地已验证」「Manifest」「不会自动更新」等技术解释；真实未就绪、失败、清理异常与禁用原因保留短反馈。
- 关于仅应用名、实际 `CARGO_PKG_VERSION`（当前 0.1.0）及 GitHub 链接。

**托盘**移除品牌标题，外 HWND 为 248×172（实测 96 DPI），单行状态＋下载/时钟/警告 Canvas 图标和数字，有任务才出现箭头；下载与失败并存仍保留红色失败数。默认行透明，仅 hover/键盘选中高亮，闲置状态无假箭头。使用 Palette Surface、细边框和内部柔影，不扩大 HWND 命中区域；130ms 淡入，reduced motion 立即显示。关闭优先直接销毁窗口，避免不可见拦截窗。英文清理异常缩短为 `Cleanup unknown`。Shell 所有权、左键恢复、右键切换、队列入口与唯一 ExitIntent/Stop/stopped 路径保留。

## B9 调查与修复的证据边界

**历史「点击完全无反应」在开工时的当前开发版未复现，不能声称锁定其唯一历史根因。** 修改前真实点击已成功查询官方 stable `2026.10.26`，有 `b9-before.jsonl` 与截图。

代码调查确认反馈链路存在缺口：UI 丢弃 owner 更新及查询受理返回值；设置窗口曾保留创建时的 checker clone；很快结束的 pending 加每秒刷新可能难以感知；fixture 禁用条件和展示不一致。现改为读取当前 owner 投影，明确处理 accepted/refused，立即显示至少可感知约 700ms 的「检查中…」，结束显示可信上游稳定版本/时间或简短失败。单 worker、冷却及超时占槽时明确禁用并解释；拒绝不会伪装为成功。

原生另复现并修复：检查按钮禁用后焦点丢失，Esc 无法收起操作区。回调现将焦点移回设置正文，最终 EXE 已验证检查中/结果后 Esc 都可关闭。

- 修改前真实请求：`checked_at_ms=1793597189061`，stable `2026.10.26`。
- 最终 EXE 真实请求：点击立即出现检查中，终态 stable `2026.10.26`，见 `b9-final-immediate.png`、`b9-final-result.png`、`native-final.jsonl`。
- 保持官方 GitHub stable 只读查询、Windows 系统路由、单 worker、5 秒冷却、30 秒可见截止、OS 路由不可硬取消时继续占槽、迟到结果丢弃。未下载安装、激活或替换任何运行时。

## 工程验证

最终全目标命令：

```text
cargo test --offline --locked --manifest-path ameow-next/Cargo.toml --all-targets -- --test-threads=1
cargo build --offline --locked --manifest-path ameow-next/Cargo.toml --bin ameow-next
```

结果 **229 passed / 0 failed / 12 既有忽略**；最终开发版构建无 warning。新增必要回归覆盖可信版本门控、快速受理反馈/拒绝和禁用门控、诊断成功反馈到期，以及清理异常时排队信息保留。已有上游与路由测试覆盖本地 HTTP 成功/403/429/重定向拒绝/过大响应、离线连接拒绝、无效稳定版本格式、读取超时、单 worker 合并/冷却恢复、30 秒截止与迟到丢弃，以及不支持路由的拒绝与错误文案。未改本机代理/PAC 去制造真实系统路由故障。

三个 UI 模块 `rustfmt --check` 与产品增量 whitespace 检查通过。整个历史 dirty tree 的默认 `git diff --check` 会报告既有 journal/index 的 CRLF；未为本轮重写这些历史差异，允许 CR-at-EOL 的产品检查通过。日志：`tra28-r9.local/tests-final.log`、`build-final.log`。

最终开发 EXE：37,569,024 bytes，SHA-256 `baa9892f27996e4a8cae7a65812f33005440a426e03d6f5096e8fa62b97e31e5`。本轮所有产品改动保持未提交，未 stage/commit/push/merge。

## Windows 原生结果

直接运行同一工作树开发 EXE，使用现有本机配置/Runtime；Windows 桌面 2560×1440、96 DPI。四页设置与空闲托盘均检查 Light/Dark × 中文/English 四种组合。页面截图为 HWND 紧裁图，联系图每页 2×2；排列为左上浅中、右上深中、左下浅英、右下深英。

| 范围 | 实际观察 |
|---|---|
| 设置布局 | 四页四组合可读；三项组件组合版本不越界；长路径中段省略、完整 tooltip/复制；目录选择取消后配置未改变；打开触发实际 Explorer |
| 开关/下拉/ACK | 开机启动确实写入当前开发 EXE＋`--login-startup`，关闭后实际 Run 项消失；主题语言上下键/Enter 经 ACK 保存并即时切换，重启保留；原配置最终精确恢复 |
| 诊断 | 实际复制脱敏有界摘要，成功后显示，约两秒消失；不把请求已发出当复制成功 |
| B9 | 真实官方请求即时反馈、成功终态与检查时间；检查中和终态后的 Esc 已验证 |
| 托盘 | 248×172，TOPMOST，真实 Shell 图标锚点/工作区限幅；键盘选择、Esc、再次右键、外点关闭通过，无遗留窗口 |
| 三窗 | 隐藏主窗后托盘打开设置未恢复主窗；设置关闭后托盘退出正常，最终产品进程 exit 0 |
| 混合队列/退出 | 同一最终 EXE 的有界无网络 fixture 显示下载 3＋排队 2＋失败 2，点击状态进入已有队列；Continue 保持运行，再次退出 Stop 发出唯一 stop 并正常 exit 0 |

实际原生进程回执：首轮 PID 70540 exit 0，矩阵轮 PID 44116 exit 0，最终正式模式 PID 60284 exit 0；最终 EXE 的无网络 fixture PID 63680 exit 0。fixture 不构造 Coordinator/真实 Runtime 或真实媒体任务，仅验证原生交互和现有命令路径；真实在途媒体任务的停止行为不因该结果被宣告复验通过。

证据目录：`.trellis/research/tra28-r9.local/`。主要入口：`sheet-general.png`、`sheet-download.png`、`sheet-components.png`、`sheet-about.png`、`sheet-tray.png`、`tray-mixed-queue.png`、`exit-confirm-continue-stop.png`、`native-final.jsonl`、`native.jsonl`（fixture）、`native-steps.jsonl`、`restored-state.json`。联系图来自最终布局；长路径末次修复后四种下载页截图已更新。

## 保留限制与交接

- 原生覆盖为单屏 96 DPI；混合 DPI/多屏、极端长版本/多位任务数、英文混合清理异常状态、系统 reduced-motion 切换、自动隐藏任务栏、折叠区与 Explorer 重启恢复未独立复验。不得将代码支持或字符串单测算作这些原生场景通过。
- R8 图标几何不可得时估算回退可能影响相邻图标，以及 R7 Windows 同步路由解析不能硬取消，仍按原边界保留。本轮未改 Shell 策略，也未宣称消除这些风险。
- 最终只读代码复核未发现新增 blocking；极端状态/缩放导致主状态文字裁切仍作为未验证风险记录。它不替代网页 Review 或用户视觉验收。
- 下一步仅网页 Review 和用户针对性复验：四页视觉与下拉/路径体验、托盘 hover/状态密度、本人环境 B9 即时反馈与终态。此前 A–E 除 B9 已人工通过的事实保留，不强制重跑全套。
- **到此停止；不启动 R10/其他任务，不进入 Final 结案/T04/Gate B，不关闭 Issue。**
