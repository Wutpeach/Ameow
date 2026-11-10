# Ameow

Ameow 是基于 Rust / GPUI 的 Windows 悬浮下载应用。本仓库维护正式 Rust 开发基线，主线接管记录见 [#18](https://github.com/Wutpeach/Ameow/issues/18)。

**Rust 版尚未正式公开发行。** Windows x64 的 Inno Setup 默认浅色安装版和 Launcher 便携 ZIP 正在受控验证；生产签名与公开发行限制尚未解除。[Electron v0.3.1](https://github.com/Wutpeach/Ameow/releases/tag/v0.3.1) 仅作为历史记录保留，已废弃，不再维护、升级或提供兼容支持。

[English](README.en.md) · [文档站](https://wutpeach.github.io/Ameow/docs/) · [开发说明](CONTRIBUTING.md) · [整理与恢复](docs/repository-handoff.md)

## 从源码运行

当前原生平台是 Windows x64（MSVC）。需要 Rust 1.93.0、Visual Studio C++ Build Tools 和 Windows SDK。应用本身不依赖 Node、Python 或 Electron。

```powershell
cargo build --locked
./target/debug/ameow.exe
```

可粘贴单个 YouTube / Bilibili 视频链接；设置、托盘和下载队列沿用已接受的 Rust 基线。所需下载组件按内嵌清单验证并准备，支持显式查询/选择可信 yt-dlp 版本。实际产品范围和未覆盖场景以关联 Issue 与原始验收记录为准，不承诺旧 Electron 的全部功能。

## 更新与现有数据

当前设置、运行时选择和缓存位于 `%LOCALAPPDATA%\Ameow`；程序目录与用户数据分离。不迁移或清理旧 `AmeowNext\stage-a` 数据，也不导入 Electron 配置。单实例与当前 Windows 启动项使用 `Ameow`；仅在用户调整开机启动时退役可识别的早期 Rust `AmeowNext` 启动项。

发行布局的正常入口是稳定的 `AmeowLauncher.exe`，应用位于 `versions/<version>/Ameow.exe`；安装版默认位于 `%LOCALAPPDATA%\Programs\Ameow`，便携版需完整解压。源码开发版仍可直接运行 Cargo 输出的 `ameow.exe`。安装、更新和移动目录前正常退出应用；开机启动由用户在设置中选择，外部快捷方式不会自动迁移。实际重新登录启动仍待验收。

## 文档与发行

文档站独立使用 Node >=22.19.0：

```powershell
npm ci --prefix site
npm --prefix site run build
```

Pages 地址保持不变，文档以当前 Rust 源码为准；历史 Electron v0.3.1 已停止支持。文档维护由 [#19](https://github.com/Wutpeach/Ameow/issues/19) 跟踪，网页选择问题由 [#22](https://github.com/Wutpeach/Ameow/issues/22) 研究。

应用自有代码采用 [MIT](LICENSE)。第三方代码、字体、图标及运行时适用各自许可，见 [发行材料](distribution/packaging.md) 与 [第三方说明](THIRD_PARTY_NOTICES.md)。材料清单保留实际第三方义务；构建与打包不依赖人工审批状态。安装版和便携版的构建、离线签名及手动发行衔接见 [Windows 交付说明](distribution/windows-delivery.md)；现有 CI 不上传 EXE/ZIP，也不自动发布。
