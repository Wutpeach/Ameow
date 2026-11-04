# Ameow

Ameow 是基于 Rust / GPUI 的 Windows 悬浮下载应用。本仓库维护正式 Rust 开发基线，主线接管记录见 [#18](https://github.com/Wutpeach/Ameow/issues/18)。

**公开下载仍是 [Electron v0.3.1](https://github.com/Wutpeach/Ameow/releases/tag/v0.3.1)。Rust 版尚未公开发行安装包。** 旧 Tags、Releases 与可恢复历史保留；旧浏览器扩展不接入当前 Rust 版。不要将历史 Electron 安装包当作当前 Rust 实现。

[English](README.en.md) · [文档站](https://wutpeach.github.io/Ameow/docs/) · [开发说明](CONTRIBUTING.md) · [整理与恢复](docs/repository-handoff.md)

## 从源码运行

当前原生平台是 Windows x64（MSVC）。需要 Rust 1.93.0、Visual Studio C++ Build Tools 和 Windows SDK。应用本身不依赖 Node、Python 或 Electron。

```powershell
cargo build --locked
./target/debug/ameow.exe
```

可粘贴单个 YouTube / Bilibili 视频链接；设置、托盘和下载队列沿用已接受的 Rust 基线。所需下载组件按内嵌清单验证并准备，支持显式查询/选择可信 yt-dlp 版本。实际产品范围和未覆盖场景以关联 Issue 与原始验收记录为准，不承诺旧 Electron 的全部功能。

## 更新与现有数据

为了复用已有设置、运行时选择、缓存和历史，继续使用 `%LOCALAPPDATA%\AmeowNext\stage-a`。不移动、清空用户数据，也不读取旧 Electron 配置。单实例协调与 Windows 启动项的内部 `AmeowNext` 标识有意保留。

EXE 正式名称为 `Ameow.exe`（Cargo 输出 `ameow.exe`）。从旧开发版更名或移动目录后，先正常退出旧版，再启动新版；重建旧快捷方式/任务栏固定项。曾开启开机启动的用户应在新版本设置中重新开启并核对启动状态；未开启者不会自动注册。外部快捷方式不会自动迁移，实际重新登录启动尚未实测。

## 文档与发行

文档站独立使用 Node >=22.19.0：

```powershell
npm ci --prefix site
npm --prefix site run build
```

Pages 地址保持不变，文档以当前 Rust 源码为准，并明确区分尚未公开发行的 Rust 版与历史 Electron v0.3.1。文档维护由 [#19](https://github.com/Wutpeach/Ameow/issues/19) 跟踪，网页选择问题由 [#22](https://github.com/Wutpeach/Ameow/issues/22) 研究。

应用自有代码采用 [MIT](LICENSE)。第三方代码、字体、图标及运行时适用各自许可，见 [发行材料](distribution/packaging.md) 与 [第三方说明](THIRD_PARTY_NOTICES.md)。构建不等于发行许可通过；私有包需要匹配当前输入的审核，公开发行 Gate B 继续阻断。本仓库没有自动发布安装包的工作流。
