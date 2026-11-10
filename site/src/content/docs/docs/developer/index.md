---
title: 开发者指南
description: Rust / GPUI 开发入口与项目契约。
---

当前源码是仓库根目录的 Rust / GPUI 应用，已验证的平台为 Windows x64 / MSVC。Rust 尚未正式公开发行，双资产仍在受控验证；[Electron v0.3.1](https://github.com/Wutpeach/Ameow/releases/tag/v0.3.1) 已废弃且停止支持。

- [本地开发](./local-development/)：工具链与启动。
- [环境变量](./environment-variables/)：数据路径与测试输入。
- [测试与验证](./testing/)：验证范围与原生 UI。
- [文档站点与本地化](./docs-and-locales/)：独立站点的开发和部署。

源码结构与约束以仓库 [CONTRIBUTING](https://github.com/Wutpeach/Ameow/blob/main/CONTRIBUTING.md)、[Rust 契约入口](https://github.com/Wutpeach/Ameow/blob/main/.trellis/spec/rust/index.md)和[仓库交接](https://github.com/Wutpeach/Ameow/blob/main/docs/repository-handoff.md)为准。历史 Electron 源码可查 [v0.3.1 标签](https://github.com/Wutpeach/Ameow/tree/v0.3.1)。
