<h1 align="center"><img src="site/public/ameow-logo.png" alt="Ameow 应用图标" width="48" align="middle"> Ameow</h1>

<p align="center">桌面上的下载小猫，贴个链接就开工。</p>

<p align="center">
  <a href="https://github.com/Wutpeach/Ameow/releases/latest"><img src="https://img.shields.io/github/v/release/Wutpeach/Ameow?style=flat-square&amp;labelColor=30363d&amp;label=&amp;color=0b78d0&amp;logo=github&amp;logoColor=white" alt="Ameow 最新正式版本 v0.5.0" height="20"></a>
  <a href="https://github.com/Wutpeach/Ameow/releases/tag/v0.5.0"><img src="https://img.shields.io/badge/Windows-x64-0b78d0?style=flat-square&amp;labelColor=30363d" alt="Windows x64" height="20"></a>
  <a href="https://github.com/Wutpeach/Ameow/releases/tag/v0.5.0"><img src="https://img.shields.io/badge/macOS-arm64-0b78d0?style=flat-square&amp;labelColor=30363d&amp;logo=apple&amp;logoColor=white" alt="macOS Apple Silicon arm64" height="20"></a>
  <a href="https://github.com/Wutpeach/Ameow/blob/main/Cargo.toml"><img src="https://img.shields.io/badge/Rust-GPUI-0b78d0?style=flat-square&amp;labelColor=30363d&amp;logo=rust&amp;logoColor=white" alt="Rust / GPUI" height="20"></a>
  <a href="https://github.com/Wutpeach/Ameow/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-0b78d0?style=flat-square&amp;labelColor=30363d" alt="应用代码 MIT 许可" height="20"></a>
  <a href="https://github.com/Wutpeach/Ameow/actions/workflows/rust.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/Wutpeach/Ameow/rust.yml?style=flat-square&amp;labelColor=30363d&amp;branch=main&amp;label=CI&amp;logo=githubactions&amp;logoColor=white" alt="Ameow main 分支 Rust Windows CI 状态" height="20"></a>
</p>

切片与登录态同步为后续版本预览，正式 **0.5.0** 尚未包含。以下动图为隔离示例演示。

## 桌面小猫

小猫安静地待在桌面，靠近时展开，用完再收回。

<p align="center">
  <img src="docs/images/readme/desktop-cat.gif" alt="Ameow 桌面小猫待机，靠近时展开下载浮窗，离开后收回小猫。" width="400">
</p>

## 粘贴链接

粘贴媒体链接，小猫接过下载任务。在浮窗里查看进度。

<p align="center">
  <img src="docs/images/readme/paste-link.gif" alt="在 Ameow 浮窗粘贴链接后，同一个示例任务从受理转入下载进度。" width="400">
</p>

## 切片功能

在视频页面标出需要的一段，再交给小猫。采用快速粗切，实际边界可能落在关键帧附近。

<p align="center">
  <img src="docs/images/readme/clip-selection.gif" alt="在 Peek 的 1 秒处添加 Marker，向右拖到 4 秒形成片段选区，播放头保持独立。" width="560">
</p>

## 登录态同步

从扩展主动授权一个站点，同步浏览器已有会话，供之后的下载复用。同步不会替你登录。

<p align="center">
  <img src="docs/images/readme/session-sync.gif" alt="在已授权的示例站点点击立即同步，Ameow 扩展显示同一站点的浏览器来源与最近同步结果。" width="560">
</p>

## 开发与构建

开发环境和构建步骤见[贡献指南](CONTRIBUTING.md)。脚本与 Agent 可通过 ameow-cli 操作同一桌面队列，详见[CLI 用户指南](https://github.com/Wutpeach/Ameow/blob/2c916bc78a593cae3e5cc2f8961cb07374002def/site/src/content/docs/docs/cli.md)（开发候选；正式 0.5.0 尚不含 CLI）。

---

[使用手册](https://wutpeach.github.io/Ameow/docs/) · [English](README.en.md) · [第三方说明](THIRD_PARTY_NOTICES.md) · [动图来源](docs/images/readme/README.md)
