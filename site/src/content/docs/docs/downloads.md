---
title: 下载 Ameow
description: 选择正确的 Ameow 发布包，理解 Windows、macOS 和浏览器扩展文件分别适合什么场景。
---

Ameow 的发布包托管在 GitHub Releases。普通用户只需要做一件事：打开最新稳定版本，按自己的系统下载对应文件。不要下载源码压缩包，源码包通常叫 `Source code`，它不是可以直接运行的 Ameow 应用。

[截图：GitHub Releases 页面中 Assets 区域，标出 Installer、Portable、DMG 和 browser_extension zip]

## 最快选择

| 你使用的环境 | 优先下载 | 适合谁 | 下载后做什么 |
| --- | --- | --- | --- |
| Windows 日常使用 | `Ameow_<version>_windows_x64_installer.exe` 或类似 Installer EXE | 大多数 Windows 用户 | 运行安装包，然后从开始菜单或桌面启动 Ameow |
| Windows 临时试用或便携目录 | `Ameow_<version>_windows_x64_portable.zip` 或类似 Portable ZIP | 不想安装到系统、想放在固定工具目录的用户 | 解压 ZIP，再运行里面的 Ameow 程序 |
| macOS Apple Silicon | `Ameow_<version>_macos_arm64_installer.dmg` 或类似 Apple Silicon DMG | M 系列芯片 Mac 用户 | 打开 DMG，把 `Ameow.app` 拖进 `Applications` |
| 浏览器扩展 | `Ameow_<version>_browser_extension.zip` | 需要从网页直接发送下载任务的用户 | 解压后在 Chrome/Edge 中用 Load unpacked 加载 |

[示意图：Windows Installer、Portable ZIP、macOS DMG、浏览器扩展 zip 的选择路径]

## 下载步骤

1. 打开 [最新版本 Releases](https://github.com/Wutpeach/Ameow/releases/latest)。
2. 找到页面里的 `Assets` 区域。
3. 按上表选择你的平台文件。
4. 下载完成后先不要删除安装包或 zip，等确认 Ameow 能正常启动后再清理。
5. 如果你还需要浏览器扩展，也下载同版本的 `browser_extension.zip`。

你应该看到的是一个平台安装包、便携包或 DMG 文件，而不是项目源码目录。如果浏览器下载了 `.zip`，先确认它是不是 `portable` 或 `browser_extension`，不要误把 `Source code.zip` 当作应用。

## Windows Installer 和 Portable 怎么选？

优先选 Installer EXE。它适合长期使用，也更接近普通桌面应用的安装方式。

Portable ZIP 适合这些情况：

- 你只是临时试用。
- 你希望把 Ameow 放在一个固定工具目录里。
- 你不想修改系统安装状态。
- 你需要在不同工作目录之间移动应用。

Portable ZIP 下载后必须先完整解压。不要直接在压缩包预览窗口里运行程序，否则应用可能无法正确访问随包文件。

## macOS 下载后怎么启动？

当前 macOS 包面向 Apple Silicon，也就是 M 系列芯片 Mac。下载 DMG 后：

1. 双击打开 DMG。
2. 把 `Ameow.app` 拖到 `Applications`。
3. 从 `Applications` 启动 Ameow。
4. 如果 macOS 提示无法验证开发者，右键 `Ameow.app`，选择“打开”。

如果右键打开仍被拦截，按 [macOS 首次启动](../troubleshooting/macos-first-run/) 的步骤处理。普通用户不需要自己编译应用。

## 浏览器扩展是否必须下载？

不是。只用桌面悬浮窗口拖拽文件、复制文件、粘贴普通链接时，可以先不装扩展。

建议安装扩展的情况：

- 你想在 YouTube、Bilibili、X / Twitter、Douyin、Xiaohongshu 等网页里直接发送任务。
- 某些内容需要浏览器登录态或 Cookies。
- 你想让网页里的下载质量偏好同步到桌面端。

扩展 zip 需要解压后加载，不能直接把 zip 丢进浏览器。完整步骤见 [安装扩展](../extension/install/)。

## 稳定版和预发布版怎么选？

普通用户选择最新稳定版。预发布版通常用于验证打包、平台修复或新下载能力，可能还会调整。

如果你正在帮忙测试，可以先阅读 [Release Notes](../releases/) 中的“预发布记录”，确认该版本主要验证什么问题。正式使用时，优先回到最新稳定版。
