---
title: 本地开发环境
description: 在 Windows x64 或 Apple Silicon Mac 从源码运行 Rust 应用。
---

仓库的 `rust-toolchain.toml` 固定 Rust 1.98.1。应用本身不依赖 Node、Python 或 Electron；下载组件由应用准备。以下命令均从仓库根目录运行。

## Windows x64 / MSVC

安装 Rust、Visual Studio C++ Build Tools 和 Windows SDK，使用 MSVC 工具链：

```powershell
cargo build --locked --bin ameow
./target/debug/ameow.exe
```

## macOS Apple Silicon / arm64

在 Apple Silicon Mac 安装 Rust 与 Xcode 开发工具，确保当前 Xcode 工具链可用：

```sh
cargo build --locked --bin ameow
./target/debug/ameow
```

源码可执行文件用于开发；Finder 启动、系统登录项和完整应用更新使用 `Ameow.app`。应用包入口与前置条件见仓库 [macOS 打包脚本](https://github.com/Wutpeach/Ameow/blob/main/scripts/package_macos.sh)；不要把脚本产生本地测试包等同于正式发行。当前仅在 macOS 26.3 arm64 实测，声明最低 macOS 13 不代表旧系统已经验证；Intel、Universal 和 Linux 不在当前已验证范围。

## 使用与数据

可粘贴公开媒体链接，Windows 使用 `Ctrl+V`，Mac 使用 `Command+V`；范围见[支持站点](../../extension/supported-sites/)。旧浏览器扩展不接入 Rust。

设置、运行时选择、缓存和历史保存在当前用户目录：Windows 为 `%LOCALAPPDATA%\Ameow`，macOS 为 `~/Library/Application Support/AmeowNative`。不要为了开发清空现有数据；Rust 不自动导入旧 Electron 配置。

`src/` 是应用源码，`tests/` 是集成测试，`assets/` 保存嵌入资源及运行时清单，`distribution/` 保存打包材料。文档站 `site/` 独立使用 Node，参见[站点开发](../docs-and-locales/)。
