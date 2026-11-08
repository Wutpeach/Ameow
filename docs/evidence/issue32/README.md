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
