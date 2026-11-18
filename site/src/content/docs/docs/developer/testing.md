---
title: 测试与验证
description: 运行 Rust 检查并理解验证范围。
---

在仓库根目录先运行与改动最相关的测试；常用完整检查为：

```powershell
cargo check --locked --all-targets
cargo test --locked
```

`tests/` 包含下载契约和 Windows 进程测试。需要真实运行时或媒体的测试默认标记为 ignored，必须准备其注明的输入；被忽略不代表通过。原生界面改动还需要运行受影响的实际工作流，构建和单元测试不能证明 UI 行为。

macOS 原生验证独立覆盖 Apple Silicon 上的窗口、菜单栏、下载组件及完整应用更新，范围见 [macos-native 规范](https://github.com/Wutpeach/Ameow/blob/main/openspec/specs/macos-native/spec.md)。当前实测系统为 macOS 26.3；最低版本声明和其他平台的通过记录不能代替旧系统原生证据。

Windows 截图工具及其依赖见 [UI_REGRESSION.md](https://github.com/Wutpeach/Ameow/blob/main/scripts/UI_REGRESSION.md)。验证时使用独立输出目录，保留已接受的可执行文件与历史证据。私有打包及公开发行限制见 [distribution/packaging.md](https://github.com/Wutpeach/Ameow/blob/main/distribution/packaging.md)。
