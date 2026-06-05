---
title: macOS 首次启动
description: 处理 macOS unsigned DMG 首次启动被拦截、无法验证开发者和 quarantine 放行问题。
---

当前 macOS 发行包采用开源 unsigned DMG 分发。第一次打开时，macOS 可能提示无法验证开发者、无法打开应用，或把应用标记为来自互联网下载。这通常不是安装损坏，而是系统安全策略。

[截图：macOS 提示无法验证开发者或无法打开 Ameow 的安全弹窗]

## 推荐处理顺序

按下面顺序处理，不要一开始就执行命令：

1. 把 `Ameow.app` 拖入 `Applications`。
2. 在 `Applications` 中右键 `Ameow.app`。
3. 选择“打开”。
4. 如果系统再次弹窗，选择允许打开。
5. 如果仍被拦截，再到系统设置里放行。
6. 最后才考虑使用 `xattr` 命令移除 quarantine。

## 1. 确认不是直接在 DMG 里运行

打开 DMG 后，你应该把 `Ameow.app` 拖到 `Applications`。不要长期直接在 DMG 窗口里运行应用。

成功状态：`Applications` 里能看到 `Ameow.app`，之后从 `Applications` 启动。

## 2. 使用右键打开

1. 打开 `Applications`。
2. 找到 `Ameow.app`。
3. 右键或按住 `Control` 点击应用。
4. 选择“打开”。
5. 在弹窗中再次确认打开。

右键打开和双击打开不完全一样。对 unsigned 应用，右键打开通常会给你一个额外确认入口。

## 3. 从系统设置放行

如果右键打开仍然失败：

1. 打开 `系统设置`。
2. 进入 `隐私与安全性`。
3. 在安全性区域找到 Ameow 被拦截的提示。
4. 点击“仍要打开”或类似按钮。
5. 再次启动 Ameow。

[截图：macOS 系统设置的隐私与安全性页面显示允许打开 Ameow]

成功状态：Ameow 能启动，并显示桌面悬浮窗口。

## 4. 使用命令移除 quarantine

如果系统设置里没有放行入口，或者放行后仍失败，可以执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Ameow.app"
```

执行后重新从 `Applications` 启动 Ameow。

这个命令只应指向你已经放入 `Applications` 的 Ameow 应用。不要对不确定来源的应用随意执行。

## 仍然打不开时检查什么？

如果以上步骤都失败，按顺序确认：

1. 你下载的是 Apple Silicon / arm64 DMG，而不是其他平台文件。
2. DMG 下载完整，没有被浏览器或网盘截断。
3. 应用已经拖入 `Applications`。
4. 当前 macOS 账户有运行该应用的权限。
5. 你正在使用最新稳定版。

如果某个版本的 Release Notes 提到 macOS 启动、DMG 或 Gatekeeper 相关修复，优先升级到该版本或更新版本。
