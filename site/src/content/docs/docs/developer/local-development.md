---
title: 本地开发环境
description: 在 Windows x64 上从源码运行 Rust 应用。
---

在 Windows x64 安装 Rust 1.98.1、Visual Studio C++ Build Tools 和 Windows SDK。仓库的 `rust-toolchain.toml` 固定 Rust 工具链；应用本身不依赖 Node、Python 或 Electron。

在仓库根目录运行：

```powershell
cargo build --locked
./target/debug/ameow.exe
```

当前可粘贴 YouTube 或 Bilibili 公开单个视频链接；旧浏览器扩展不接入 Rust。应用使用 `%LOCALAPPDATA%\Ameow` 保存设置、运行时选择、缓存和历史；不要为了开发清空现有数据。

`src/` 是应用源码，`tests/` 是集成测试，`assets/` 保存嵌入资源及运行时清单，`distribution/` 保存打包材料。文档站 `site/` 独立使用 Node，参见[站点开发](../docs-and-locales/)。macOS 和 Linux 原生运行未验证。
