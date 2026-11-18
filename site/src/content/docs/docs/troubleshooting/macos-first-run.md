---
title: macOS 首次启动
description: Apple Silicon 测试版的启动、菜单栏与常见问题。
---

当前 Rust / GPUI 已在 Apple Silicon Mac 的 macOS 26.3 实测。应用声明最低 macOS 13；这不是旧系统兼容矩阵已通过的承诺。Intel 和 Universal 不在当前范围。Rust 尚未正式公开发行，没有公开的 Rust 安装包；见[下载与运行](../../downloads/)。

## 已有测试版如何打开

1. 将取得的 Rust 测试版 `Ameow.app` 放在 `/Applications` 或 `~/Applications`，再从 Finder 打开。从源码运行见[本地开发](../../developer/local-development/)。
2. 在菜单栏找到 Ameow，选择打开或设置；默认不显示 Dock 图标。关闭设置窗口后，仍可从菜单栏再次打开。
3. 确认输出目录存在且可写，在 Ameow 使用 `Command+V` 粘贴公开媒体链接。双击 Full 空白背景可在 Finder 打开当前已确认的下载目录。

首次使用可能需要联网准备组件。应用负责下载、验证、缓存和更新所需组件，不要求用户自行安装 Homebrew 或 Python。下载范围见[支持站点](../../extension/supported-sites/)。

## 看不到悬浮窗口

先从菜单栏选择打开。Compact 会跟随普通 Spaces，但不会覆盖其他应用的全屏空间；切回普通桌面后再检查。Full 和设置窗口不承诺相同的 Spaces 行为，详见[悬浮窗口](../../desktop/floating-window/)。

## 启动或更新遇到问题

测试包的本机签名不等于 Apple Developer ID 签名或公证，也不代表已经公开发行。若 macOS 拒绝打开，记录系统提示和测试包来源，按该测试版的说明处理；不要照搬历史 Electron 包的修复命令。

开机启动需要已安装的应用包；如系统要求批准登录项，请按提示在系统设置中完成。应用更新仅在实际目录权限不足时请求授权；取消授权不会安装更新。当前尚无公开签名更新源，检查更新失败时先核对[发行状态](../../releases/)，并查看[设置与更新](../../desktop/settings/)。

Rust 数据保存在 `~/Library/Application Support/AmeowNative`，与旧 Electron 数据隔离。排障时保留该目录；可在组件管理或失败任务中复制诊断，并记录操作步骤与系统版本。

历史 [Electron v0.3.1](https://github.com/Wutpeach/Ameow/releases/tag/v0.3.1) 已停止支持，其下载包和启动说明不对应当前 Rust 版。
