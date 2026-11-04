---
title: 环境变量
description: 当前 Rust 数据路径和测试专用输入。
---

Rust 应用使用 Windows 的 `LOCALAPPDATA` 定位 `%LOCALAPPDATA%\AmeowNext\stage-a`，以保留现有设置、缓存和历史。该目录不是旧 Electron 配置，应用不会自动导入后者。

部分忽略的真实运行时测试使用 `AMEOW_RUNTIME_TEST_ROOT` 指向已按生产流程准备的缓存；具体要求见测试源码。它是测试输入，不是普通用户的配置选项。其他测试工具可能有各自的输入，请阅读对应源码和说明后再运行。

旧 Electron 的开发服务器、截图及扩展变量不适用于当前 Rust 应用；历史实现可查看 [v0.3.1 源码](https://github.com/Wutpeach/Ameow/tree/v0.3.1)。
