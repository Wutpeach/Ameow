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

## 数据与测试输入 {#data}

| 平台 | 当前用户数据目录 |
| --- | --- |
| Windows（`LOCALAPPDATA`） | `%LOCALAPPDATA%\Ameow` |
| macOS（`HOME`） | `~/Library/Application Support/AmeowNative` |

保留已有设置和缓存，不要为开发清空用户数据。部分真实运行时测试使用 `AMEOW_RUNTIME_TEST_ROOT` 指向按生产流程准备的缓存，具体要求以测试源码为准；这是测试输入，不是普通用户配置。

继续阅读[测试与验证](./testing/)或[文档站开发](./docs-and-locales/)。
