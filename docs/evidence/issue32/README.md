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
