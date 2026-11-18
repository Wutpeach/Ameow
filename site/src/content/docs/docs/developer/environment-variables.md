---
title: 环境变量
description: 当前 Rust 数据路径和测试专用输入。
---

Rust 应用按平台定位当前用户的数据目录，用于设置、缓存和历史：

| 平台 | 路径来源 | 数据目录 |
| --- | --- | --- |
| Windows | `LOCALAPPDATA` | `%LOCALAPPDATA%\Ameow` |
| macOS | `HOME` | `~/Library/Application Support/AmeowNative` |

这些目录与旧 Electron 配置隔离，应用不会自动导入后者。保留已有数据，不要为普通开发或排障清空它。

部分忽略的真实运行时测试使用 `AMEOW_RUNTIME_TEST_ROOT` 指向已按生产流程准备的缓存；具体要求见测试源码。它是测试输入，不是普通用户的配置选项。其他测试工具可能有各自的输入，请阅读对应源码和说明后再运行。

旧 Electron 的开发服务器、截图及扩展变量不适用于当前 Rust 应用；历史实现可查看 [v0.3.1 源码](https://github.com/Wutpeach/Ameow/tree/v0.3.1)。
