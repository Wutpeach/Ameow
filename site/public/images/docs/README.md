# Ameow 文档图片清单

文档正文会先使用 `[截图：...]` 或 `[示意图：...]` 占位。后续补图时，请把图片放在当前目录：

```text
site/public/images/docs/
```

命名规则：

```text
{page-slug}-{what-it-shows}.png
```

图片建议使用 PNG。截图中的敏感路径、用户名、浏览器账号和私人内容需要打码。

| 页面 | 占位文本 | 建议文件名 | 说明 |
| --- | --- | --- | --- |
| 快速上手 | `[截图：Ameow 主悬浮窗口首次启动后的空闲状态，窗口停靠在桌面边缘]` | `getting-started-floating-window-idle.png` | 展示用户启动后应看到的主窗口。 |
| 快速上手 | `[截图：把一个本地文件拖入 Ameow 悬浮窗口时的接收状态]` | `getting-started-drop-file.png` | 展示拖拽动作或拖拽后的视觉反馈。 |
| 快速上手 | `[截图：Ameow 输出目录中出现刚刚收集的文件]` | `getting-started-output-folder-result.png` | 展示成功结果。 |
| 下载 Ameow | `[截图：GitHub Releases 页面中 Assets 区域，标出 Installer、Portable、DMG 和 browser_extension zip]` | `downloads-github-release-assets-annotated.png` | 标注用户应该下载哪个资产。 |
| 下载 Ameow | `[示意图：Windows Installer、Portable ZIP、macOS DMG、浏览器扩展 zip 的选择路径]` | `downloads-package-choice-flow.png` | 用于解释不同包的选择。 |
| 浏览器扩展 | `[截图：浏览器扩展弹窗显示 Connected 状态，并展示下载质量选项]` | `browser-extension-connected-popup.png` | 展示扩展正常连接。 |
| 浏览器扩展 | `[示意图：网页页面、浏览器扩展、本地 Ameow 桌面端之间的连接关系]` | `browser-extension-connection-flow.png` | 解释扩展工作方式。 |
| 安装扩展 | `[截图：Chrome 扩展管理页面开启开发者模式并显示 Load unpacked 按钮]` | `extension-install-developer-mode.png` | 展示扩展管理页面关键按钮。 |
| 安装扩展 | `[截图：选择解压后的 Ameow 浏览器扩展目录，而不是 zip 文件]` | `extension-install-select-folder.png` | 强调选择目录。 |
| 连接桌面端 | `[截图：扩展弹窗从 Disconnected 变为 Connected 的状态对比]` | `extension-connection-status-comparison.png` | 展示连接状态区别。 |
| 下载失败 | `[示意图：下载失败排查决策树，从任务未出现、准备中、失败、完成但找不到文件四种情况分支]` | `download-failures-decision-tree.png` | 作为排查页主图。 |
| 下载失败 | `[截图：下载队列中某个任务显示失败状态和错误提示区域]` | `download-failures-queue-error.png` | 展示错误现象。 |
| macOS 首次启动 | `[截图：macOS 提示无法验证开发者或无法打开 Ameow 的安全弹窗]` | `macos-first-run-gatekeeper-dialog.png` | 展示首次拦截现象。 |
| macOS 首次启动 | `[截图：macOS 系统设置的隐私与安全性页面显示允许打开 Ameow]` | `macos-first-run-security-allow.png` | 展示系统设置放行入口。 |
| 悬浮窗口 | `[截图：Ameow 悬浮窗口停靠在桌面边缘，显示可拖入文件和粘贴链接的状态]` | `floating-window-idle.png` | 展示主入口。 |
| 输出目录 | `[截图：通过双击或右键从 Ameow 打开当前输出目录]` | `output-folder-open-current.png` | 展示打开目录结果。 |
| 文件与文件夹 | `[示意图：拖入文件会复制到输出目录，拖入文件夹会切换输出目录]` | `files-and-folders-drop-difference.png` | 解释两种拖拽行为差异。 |
| 链接与下载队列 | `[截图：下载队列显示等待、下载中、转换中、完成几种状态]` | `links-and-queue-statuses.png` | 展示队列状态。 |
| 常用设置 | `[截图：Ameow 设置页中输出目录、快捷键、下载质量和 AE 兼容相关设置区域]` | `settings-common-options.png` | 展示设置页重点区域。 |
| 扩展未连接 | `[截图：扩展弹窗显示 Disconnected，并提示桌面端未连接]` | `extension-disconnected-popup.png` | 展示连接失败现象。 |
| 找不到文件 | `[示意图：从当前输出目录、切换过的文件夹、下载任务状态三个方向定位文件]` | `missing-files-location-flow.png` | 展示定位路径。 |
