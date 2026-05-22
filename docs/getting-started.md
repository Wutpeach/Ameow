# 快速上手

[中文](./getting-started.md) | [English](./getting-started.en.md)

第一次用 Ameow？跟着下面几步，从安装到第一次下载与收集，几分钟就能跑通。

## 1. 下载 Ameow

前往 [GitHub Releases](https://github.com/Wutpeach/Ameow/releases) 下载对应平台的版本。

### Windows

- `Installer EXE`：常规安装包。
- `Portable ZIP`：免安装版本，解压即可运行。

### macOS

- `Apple Silicon DMG`：适用于 M 系列芯片 Mac。
- 当前 macOS 发行包采用开源 unsigned DMG 分发。

## 2. 安装并首次启动

### Windows

1. 运行安装包，或解压 Portable ZIP。
2. 启动 `Ameow`。
3. 首次启动后，应用会在桌面上显示一个小型悬浮窗口。

### macOS

1. 打开 DMG，把 `Ameow.app` 拖到 `Applications`。
2. 从 `Applications` 启动 Ameow。
3. 如果首次启动被 macOS 拦截，先尝试右键应用后选择“打开”，或前往 `系统设置 > 隐私与安全性` 放行。
4. 如仍被 quarantine 阻止，可执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Ameow.app"
```

## 3. 试一下：把内容交给 Ameow

先试试下面几种最常用的方式：

- 把本地文件拖进悬浮窗口，文件会立刻复制到当前输出目录。
- 把文件夹拖进悬浮窗口，立刻把它设为新的输出目录。
- 复制图片链接、视频链接或其他支持的网页链接后，用 `Ctrl+V` 或 `Cmd+V` 粘贴进去。
- 在 Windows 上，剪贴板里的文件也能直接粘贴。

## 4. 输出目录与常用设置

- 默认输出目录为 `Desktop/Ameow_Received`。
- 双击主窗口空白区域，可快速打开当前输出目录。
- 右键主窗口，可打开当前输出目录或重新选择新的输出目录。
- 设置页里可以调整：
  - 主题
  - 全局快捷键
  - 开机启动
  - 重命名规则
  - After Effects 集成
- 下载运行时会在主窗口首次需要时自动准备。

## 5. 想从浏览器里直接发到桌面？

如果你想直接在网页里发起下载，或把浏览器 Cookies 交给桌面端，请继续看这里：

- [浏览器扩展](./browser-extension.md)

## 6. 遇到问题时

遇到启动、下载或连接问题时，先看这里：

- [FAQ](./faq.md)
