# #32 GPUI Kit 迁移证据

## 引擎阶段（2026-11-08）

从 `4d57d3a70889b739cada6efc2040a1f91b6ef67e` 的独立 Worktree 开始，
固定 Rust 1.98.1、gpui-pre/platform 0.3.11 与 gpui-base 0.9.0。快照对应
Zed `f816e1f9263e3a8ef63c4baaa02e1441ce1c6038`。`Cargo.lock` 中没有旧 `gpui` 包，
所有解析的 gpui-pre 快照包均为 0.3.11。未使用 GPUI fork 或全局依赖 patch。

已适配平台创建、焦点 App 参数、drop shadow/inset、滚动上限、锚点和 scroll API。
真实输入发现新版引擎的 Enter/Space 松键自动点击与旧设置按键处理重复，导致主题菜单
开后即关；已移除设置按钮、导航和启动开关的重复键盘动作。

- `cargo check --all-targets --locked`：通过。
- Windows MSVC Debug/Release 实构建：通过；首次构建分别约 80 秒、168 秒。
- `cargo test --all-targets --locked`：323 通过、18 忽略；之后单独运行原生中英文 shaping 测试通过。
- 两种 EXE 各 12 项原生检查通过，包括不抢焦点、自然 TOPMOST、Compact/Full 尺寸、
  设置真实拖动、单次 Enter/Space 展开选项、Esc 层级关闭、托盘弹窗 Esc 和退出。
- Debug 38,615,040 字节、Release 18,694,656 字节。未据此声称相对旧版缩小或加速。

机器可读证据见 [engine-validation.json](engine-validation.json)，修复后的实际键盘菜单
见 [engine-keyboard-menu.png](engine-keyboard-menu.png)。完整构建日志、失败前证据和冻结的
引擎阶段 EXE 保留在此 Worktree 的 `evidence/issue32/`；该目录被 Git 忽略，不能将本地路径当作已上传资产。

复现（在迁移 Worktree 根目录运行，输出必须选新路径）：

```powershell
cargo build --locked --bin ameow
cargo build --locked --release --bin ameow
python scripts/test_gpui_migration.py --exe target/debug/ameow.exe --output evidence/issue32/new-debug
python scripts/test_gpui_migration.py --exe target/release/ameow.exe --output evidence/issue32/new-release
cargo test --locked --all-targets
cargo test --locked --bin ameow native_mixed_labels_use_platform_chinese_and_bundled_latin -- --ignored --test-threads=1
```

本阶段仅覆盖实际 96 DPI 桌面上的隔离 fixture/preview。尚未覆盖系统通知区域、
真实设置持久化、自动更新/重启、跨屏/其他 DPI 或 GPU 呈现节奏；不构成最终产品验收。
组件、设计 Token、Gallery 与主线同步仍需继续实施。

## Base 控件与 Gallery 开发检查点（2026-11-08）

产品设置窗口的公共按钮实际改用 gpui-base Button，保留原有 FocusHandle、键盘滚动揭示、
布局和设置 ACK 边界。Ameow 的 Palette/字体/控件几何投影为 Base SemanticThemeTokens；
没有引入 Component 默认主题或第二套颜色来源。已验证的同一设置菜单截图与引擎阶段
对照没有像素差异，Light/Dark 实际菜单、pending/disabled 外观已有局部证据。
Base 按钮的 12 项 Debug 原生检查及 Token 投影测试通过。

新增原生 --gallery 入口，复用实际 94 场景目录和独立 Preview 进程，按界面选择状态、
切换 Light/Dark、截图/查看图片；CLI 支持真实 EXE 目录、命名直达和批量 Contact Sheet/
原尺寸 HTML 索引。scene/night/step/PID ACK、原生 HWND/DPI/EXE 指纹和防覆盖均保留。
截图用临时中性背景，避免捕入其他桌面窗口内容，并明确不作自然置顶证据。

已运行的 Gallery 原生回归有 9 项通过：双实例隔离、空场景重置、错误回执、截图身份、
防覆盖、单实例退出不影响另一实例和总览链接。曾发现空场景残留前一个 Job 环，已修复并
定向复验。长批次出现控制文件原子替换 PermissionError，已加入有时限重试；不宣称
完成完整长时矩阵回归。最新 cargo check 通过；自动测试 324 通过、18 忽略；另有 4 项
不打开窗口的工具边界检查通过，包括退出请求写入失败时仍清理所属进程。

用户指出持续批量切换窗口打扰桌面后，已停止批量进程及其所属 Preview；本轮没有继续
打开窗口。最后一批 116 张图保存为 complete: false，不构成 188 张完整矩阵 PASS。
新批次逐张保存进度，Gallery/CLI 文案提示完整矩阵的桌面占用，局部修改只做定向验证。

机器可读状态见 [gallery-checkpoint.json](gallery-checkpoint.json)，实际深色产品菜单见
[base-dark-menu.png](base-dark-menu.png)，Gallery 首次运行画面见 [gallery-first.png](gallery-first.png)。
后者是早期原生入口证据，不证明后来加入的全部截图按钮已经点击验收。

**仍待完成**：最新 Gallery 的分类/主题/截图/批量取消界面验证、必要的完整职责对照、
生产设置 ACK、原生动画/DPI/系统托盘与主线自动更新联合回归。旧 PowerShell 菜单/包装脚本
仍保留，等替代覆盖和界面验收后清理。main 仍为 4d57d3a7，未提交自动更新成果没有复制。
本检查点不是 #32 最终 Done，不合并主线、不 Push/发布或关闭 Issue。

## Gallery 定向验收与工具收敛（2026-11-08 续）

从 c89cd645 继续，本阶段改动保留在 feature/gpui-kit-migration 的未提交工作区。
Gallery 已补齐“本分类截图”、批量进度、“取消截图”、截图失败直接重试和预览退出后恢复。
根据用户本轮明确同意进行了有限桌面检查；所有测试窗口/进程已退出。没有重跑 94×2。

- Gallery 定向原生检查 6 项通过；另复用本轮较早一次的 Light 单张成功证据。
  分类 Menu 完成 2 张双主题截图，完整批次仅 1 张后取消，关闭时取消另一批且完成 0 张。
  最新通过轮原生截图共 5 张，另有 3 张从这些资产派生的总览。失败/中断轮不算整轮通过。
- 普通动画与 reduced motion 各记录 122 个应用帧；中间过渡分别为 40 / 0，重复 Compact/Full
  及退出通过。这些计数不是显示器呈现帧率或卡顿指标。
- 实际 Shell 通知图标注册、所属回调打开/关闭 GPUI 弹窗、退出移除图标通过。
- 真实设置服务 + UI command/ACK + 磁盘保存/失败恢复/服务重建读回集成测试通过；
  协调器测试仅使用临时目录，未启动常规生产实例或使用用户设置；不将结果升级为完整生产 UI 端到端验收。
- 23 项设置相关测试、7 项不打开窗口的工具检查、Debug 增量构建、全目标编译检查通过。

职责对照见 [gallery-coverage.md](gallery-coverage.md)，最新阶段报告见
[gallery-stage-report.md](gallery-stage-report.md)，机器证据见
[gallery-controls-validation.json](gallery-controls-validation.json)。原尺寸菜单与恢复后截图见
[gallery-menu-light.png](gallery-menu-light.png)、[gallery-recovery-dark.png](gallery-recovery-dark.png)，
对应 JSON 保留原生截图回执与二进制身份。旧 PowerShell/控制台菜单及其专用布局测试已移除；
原生截图、CLI、隔离/ACK、DPI/跨屏/阴影、键鼠等专用验证能力保留。

本轮 GUI 按钮使用所属 HWND 的 Win32 消息，托盘采用所属回调；物理鼠标/键盘遍历、
实际 Shell 点击、生产设置 UI 全链、其他 DPI/跨屏、呈现节奏及更新/重启联合回归仍待验收。
main 仍为 4d57d3a7，自动更新尚未形成稳定提交，不复制 dirty 工作，也不提前合并。
新的产品状态未增加，仅 Gallery 开发期状态改变，94 个产品 Preview Scenes 保持不变。

## 2026-11-09 本地提交与真实输入补验

上述 Gallery/清理/兼容性成果已本地提交为 `11fc718dae33cc6960d21923a4da4c9fc17564d6`。
本轮补齐有限 Gallery 真实鼠标/键盘焦点路径，以及隔离设置窗口的真实保存失败与重试；
保留 6 张窗口截图，未运行完整矩阵。新增 test-only 宿主与本轮证据尚未提交。
设置全操作与实际 Shell 点击仍未完成；后者受到当前桌面工具未枚举任务栏的限制。
详见 [native-stage-report.md](native-stage-report.md) 与 [native-validation.json](native-validation.json)。

## 剩余交互验收与本地提交收尾

后续首次 Gallery 输入受到主线 #33 前台窗口竞争，未新增真实交互 PASS。用户选择先整理
代码与本地提交，桌面验收稍后；本轮测试进程已结束。上述 test-only 宿主与证据现随本轮
独立本地提交入库，旧报告里的“尚未提交”保留为历史检查点。详见
[remaining-stage-report.md](remaining-stage-report.md)、[remaining-validation.json](remaining-validation.json)
及尚未执行的 [manual-tray-check.md](manual-tray-check.md)。

## 2026-11-09 用户人工验收与英文说明修复

用户随后完成 Gallery 分类/滚动/焦点、设置剩余操作和真实 Shell 托盘开关/入口/退出的
人工检查。英文测试保护说明残留已局部修复并经用户复验；7 项设置窗口测试通过。
原版宿主退出日志出现尚未定位的 TLS AccessError，未将进程干净退出记为通过。
当前结论与证据边界见 [manual-native-stage-report.md](manual-native-stage-report.md) 和
[manual-native-validation.json](manual-native-validation.json)。未重跑完整矩阵，停止等待网页侧阶段验收。
