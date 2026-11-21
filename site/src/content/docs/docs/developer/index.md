---
title: 开发资料
description: Rust / GPUI 工具链、启动与数据路径。
---

本节面向贡献者。安装应用请使用[下载页面](../downloads/)；项目行为要求见仓库 [OpenSpec](https://github.com/Wutpeach/Ameow/blob/main/openspec/README.md)，贡献约定见 [CONTRIBUTING](https://github.com/Wutpeach/Ameow/blob/main/CONTRIBUTING.md)。

## 工具链与启动

`rust-toolchain.toml` 固定 Rust 1.98.1。Windows x64 使用 MSVC，需 Visual Studio C++ Build Tools 与 Windows SDK；Apple Silicon Mac 需 Xcode 开发工具。以下命令从仓库根目录运行：

```sh
cargo build --locked --bin ameow
```

Windows 运行 `./target/debug/ameow.exe`，Mac 运行 `./target/debug/ameow`。Finder 启动、系统登录项和完整应用更新使用 `Ameow.app`；前置条件见 [Mac 打包脚本](https://github.com/Wutpeach/Ameow/blob/main/scripts/package_macos.sh)。Mac 实测为 26.3 arm64，最低 13 的声明不代表较旧系统均已验证。

## CLI

普通用户的版本可用性、完整包安装和命令见[命令行与 Agent](../cli/)。源码 main 已有普通桌面控制 CLI；`dev` 开发入口需要包含 [PR #61](https://github.com/Wutpeach/Ameow/pull/61) 的检出。以下在自己独立的开发目录中运行，不需要切换正在使用的旧工作树。

普通控制 CLI 与相邻应用一起构建，使用固定 target：

~~~sh
cargo build --locked --bin ameow --bin ameow-cli --target-dir target
~~~

Windows PowerShell 运行 `./target/debug/ameow-cli.exe --help`；Mac zsh/bash 运行 `./target/debug/ameow-cli --help`。运行 help 不会启动应用。源码开发中的独立桌面实例用法见仓库 [CLI 参考](https://github.com/Wutpeach/Ameow/blob/main/docs/cli.md)。

仅开发场景才构建带 `dev-tools` 的 debug CLI。它没有设置开关，release 构建明确拒绝此特性。在包含 PR #61 的目录构建一次：

~~~sh
cargo build --locked --features dev-tools --bin ameow-cli --target-dir target
~~~

Windows PowerShell：

~~~powershell
./target/debug/ameow-cli.exe dev --help
./target/debug/ameow-cli.exe dev scenario --root evidence/dev-success --case success
~~~

Mac zsh/bash：

~~~sh
./target/debug/ameow-cli dev --help
./target/debug/ameow-cli dev scenario --root evidence/dev-success --case success
~~~

每次场景使用新根。`scenario` 使用固定离线 Adapter 与真实任务核心，不启动 GUI、不联网下载；`dev run` 则调用正式下载器，可能准备组件并联网，需要自己的真实媒体 URL。独立候选检出步骤、真实 run 示例、工具替代与完整参数集中在仓库 [CLI 开发指南](https://github.com/Wutpeach/Ameow/blob/main/docs/developer-cli.md)。

## 数据与测试输入 {#data}

| 平台 | 当前用户数据目录 |
| --- | --- |
| Windows（`LOCALAPPDATA`） | `%LOCALAPPDATA%\Ameow` |
| macOS（`HOME`） | `~/Library/Application Support/AmeowNative` |

保留已有设置和缓存，不要为开发清空用户数据。部分真实运行时测试使用 `AMEOW_RUNTIME_TEST_ROOT` 指向按生产流程准备的缓存，具体要求以测试源码为准；这是测试输入，不是普通用户配置。

继续阅读[测试与验证](./testing/)或[文档站开发](./docs-and-locales/)。
