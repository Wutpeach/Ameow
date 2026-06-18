<div align="center">
  <p>
    <img src="./docs/readme/banner.png" alt="Ameow Desktop Media Downloader banner" width="100%" />
  </p>
  <p><strong>Ameow 是一个常驻桌面的悬浮下载与收集窗口，拖拽文件、粘贴链接，网页里的内容也能直接发到桌面。</strong></p>
  <p>
    <a href="./README.md">中文</a> |
    <a href="./README.en.md">English</a> |
    <a href="https://github.com/Wutpeach/Ameow/releases">下载 Releases</a> |
    <a href="https://wutpeach.github.io/Ameow/docs/getting-started/">快速上手</a> |
    <a href="https://wutpeach.github.io/Ameow/docs/browser-extension/">浏览器扩展</a> |
    <a href="https://wutpeach.github.io/Ameow/docs/faq/">FAQ</a> |
    <a href="./release-notes/">Release Notes</a>
  </p>
  <p>
    <img alt="Latest release" src="https://img.shields.io/github/v/release/Wutpeach/Ameow?display_name=tag" />
    <img alt="Release workflow" src="https://img.shields.io/github/actions/workflow/status/Wutpeach/Ameow/release.yml?label=release" />
    <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-111827" />
  </p>
</div>

拖进文件、粘贴链接，下载和收集都会立刻开始。配合浏览器扩展，网页里的视频和资源也能直接发到桌面。分散在桌面和浏览器里的下载任务，可以统一交给同一个入口处理。

## 主要功能

- **悬浮窗口**：文件、文件夹、链接和 Windows 剪贴板内容都能直接拖进来或粘贴进来。
- **下载队列**：网页视频进入队列后可查看实时进度、取消任务，并支持最多 3 个并发下载。
- **浏览器联动**：扩展可把视频链接、Cookies 和下载偏好送到桌面端；登录态 Cookies 只保存在本机，Ameow 不会上传。
- **按站点登录态同步**：启用后不会立即同步所有站点，而是在下载匹配站点时尝试同步该站点 Cookies。
- **设置可控**：输出目录、重命名规则、快捷键、开机启动，以及 After Effects 集成都能按自己的习惯调整。

## 获取 Ameow

<p>
  <a href="https://github.com/Wutpeach/Ameow/releases/latest"><img alt="Windows Installer EXE" src="https://img.shields.io/badge/Windows-Installer_EXE-2563EB?logo=windows&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/Ameow/releases/latest"><img alt="Windows Portable ZIP" src="https://img.shields.io/badge/Windows-Portable_ZIP-0F6CBD?logo=windows&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/Ameow/releases/latest"><img alt="macOS Apple Silicon DMG" src="https://img.shields.io/badge/macOS-Apple_Silicon_DMG-111827?logo=apple&logoColor=white" /></a>
</p>

安装、首次启动与常见平台问题请查看 [快速上手](https://wutpeach.github.io/Ameow/docs/getting-started/)。

## 使用指南

- [快速上手](https://wutpeach.github.io/Ameow/docs/getting-started/)：从安装到第一次下载，几分钟就能跑通。
- [浏览器扩展](https://wutpeach.github.io/Ameow/docs/browser-extension/)：把网页里的链接、Cookies 和偏好送到桌面端。
- [Cookies 与登录态](https://wutpeach.github.io/Ameow/docs/extension/cookies-and-login/)：了解本机保存、不上传，以及下载时按站点同步的工作方式。
- [FAQ](https://wutpeach.github.io/Ameow/docs/faq/)：处理 macOS 放行、下载失败与连接问题。

## 开发

### 环境要求

- Node.js 20+
- npm

### 常用命令

```bash
npm install
npm run dev
npm run build
npm run lint
npm run type-check
npm run test
```

### 仓库结构

- `src/`：桌面端 React 界面。
- `electron/`：Electron 主进程、托盘与原生窗口集成。
- `browser-extension/`：浏览器扩展源码。
- `site/`：Astro/Starlight 文档站源码。
- `docs/`：工程文档、参考记录和仓库内资产。
- `desktop-assets/`：应用图标、打包素材和托管运行时清单。
- `distribution/`、`release-notes/`：发布包附带资料和版本发布说明。
- `scripts/`、`locales/`：构建、打包、版本和多语言同步脚本及源文案。

## 致谢

Ameow 的部分核心能力建立在优秀的开源项目之上。特别感谢 `yt-dlp`、`gallery-dl` 和 `FFmpeg`，它们为网页媒体提取、资源下载与后续媒体处理提供了重要基础。

也感谢所有被本项目使用到、但未在此一一列出的开源项目与维护者。
