---
title: 开发者指南
description: Rust / GPUI 开发入口与项目契约。
---

当前源码是仓库根目录的 Rust / GPUI 应用，Windows x64 / MSVC 与 macOS Apple Silicon 已有原生验证。Mac 仅在 macOS 26.3 实测；声明最低 macOS 13 不代表旧系统已验证，Intel、Universal 和 Linux 不在当前已验证范围。Rust 0.5.0 尚未正式公开发行，没有公开安装包或签名更新源；[Electron v0.3.1](https://github.com/Wutpeach/Ameow/releases/tag/v0.3.1) 已废弃且停止支持。

- [本地开发](./local-development/)：工具链与启动。
- [环境变量](./environment-variables/)：数据路径与测试输入。
- [测试与验证](./testing/)：验证范围与原生 UI。
- [文档站点与本地化](./docs-and-locales/)：独立站点的开发和部署。

源码结构与约束以仓库 [CONTRIBUTING](https://github.com/Wutpeach/Ameow/blob/main/CONTRIBUTING.md) 和 [Rust 契约入口](https://github.com/Wutpeach/Ameow/blob/main/openspec/README.md)为准，旧交接资料的来源可用性见[工程文档与历史说明](https://github.com/Wutpeach/Ameow/blob/main/docs/README.md)。历史 Electron 源码可查 [v0.3.1 标签](https://github.com/Wutpeach/Ameow/tree/v0.3.1)。
