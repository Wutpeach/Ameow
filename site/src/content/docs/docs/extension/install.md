---
title: 安装扩展
description: 在 Chrome 或 Edge 中加载 Ameow 浏览器扩展，并确认扩展安装成功。
---

Ameow 浏览器扩展通常通过 GitHub Release 附带的 zip 包安装。你需要先解压，再在浏览器扩展管理页用 `Load unpacked` 加载解压后的目录。

## 开始前确认

你需要：

- 已安装 Chrome、Edge 或其他支持 Manifest V3 的 Chromium 浏览器。
- 已下载 `Ameow_<version>_browser_extension.zip`。
- 已安装或准备启动同版本的 Ameow 桌面端。

扩展 zip 和桌面端版本最好保持一致。版本不一致时，有些新能力可能无法正常连接或显示。

## 安装步骤

1. 打开 [GitHub Releases](https://github.com/Wutpeach/Ameow/releases)。
2. 下载当前版本的 `Ameow_<version>_browser_extension.zip`。
3. 在本地解压这个 zip。
4. 打开 Chrome 或 Edge 的扩展管理页面。
5. 开启“开发者模式”。
6. 点击 `Load unpacked` 或“加载已解压的扩展程序”。
7. 选择刚才解压出来的 Ameow 扩展目录。
8. 确认扩展列表中出现 Ameow。

[截图：Chrome 扩展管理页面开启开发者模式并显示 Load unpacked 按钮]

[截图：选择解压后的 Ameow 浏览器扩展目录，而不是 zip 文件]

成功状态：浏览器扩展列表中出现 Ameow 扩展，并且没有 manifest、权限或目录错误提示。

## 选择目录时最容易出错

请选“解压后的扩展目录”，不要选：

- 原始 zip 文件。
- zip 解压后的上一级空目录。
- Ameow 桌面端安装目录。
- 主仓库源码根目录。

如果浏览器提示找不到 manifest，通常说明你选错了目录。重新选择包含扩展 manifest 文件的那一层目录。

## Chrome 和 Edge 的入口

Chrome 通常可以在地址栏打开：

```text
chrome://extensions
```

Edge 通常可以打开：

```text
edge://extensions
```

进入页面后开启开发者模式，再加载已解压的扩展目录。

## 安装后马上做连接检查

1. 启动 Ameow 桌面端。
2. 点击浏览器工具栏里的 Ameow 扩展图标。
3. 查看弹窗状态。

如果显示 `Connected`，安装和连接都已经成功。如果显示 `Disconnected`，扩展已经安装，但还没有连上桌面端，需要按 [连接桌面端](../connection/) 的步骤处理。

## 建议固定到工具栏

安装成功后，建议把 Ameow 扩展固定到浏览器工具栏。这样你在网页里遇到可下载内容时，可以直接打开扩展弹窗确认连接状态和下载偏好。

如果扩展图标没有出现在工具栏：

1. 点击浏览器右上角的扩展按钮。
2. 找到 Ameow。
3. 选择固定或显示在工具栏。

## 更新扩展

当你更新 Ameow 桌面端时，最好也下载同版本的浏览器扩展 zip。更新方式通常是：

1. 下载新版本 `browser_extension.zip`。
2. 解压到新的目录，或覆盖旧扩展目录。
3. 回到扩展管理页。
4. 点击 Ameow 扩展的重新加载按钮。
5. 打开扩展弹窗确认状态。

如果你移动或删除了解压目录，浏览器可能无法继续加载扩展。建议把扩展解压到一个固定位置，不要放在临时下载目录里。
