# Ameow

Ameow 是基于 Rust / GPUI 的悬浮下载应用，支持 Windows x64 和 Apple Silicon Mac。粘贴公开媒体链接，管理下载队列，选择画质和保存位置；空闲时，猫咪回到 Compact 窗口。

[English](README.en.md) · [使用手册](https://wutpeach.github.io/Ameow/docs/) · [开发说明](CONTRIBUTING.md) · [工程文档与历史说明](docs/README.md)

## 下载与安装

| Ameow 0.5.0 | 下载 |
| --- | --- |
| Windows x64 安装版 | [安装程序](https://github.com/Wutpeach/Ameow/releases/download/v0.5.0/Ameow_0.5.0_windows_x64_installer.exe) |
| Windows x64 便携版 | [便携 ZIP](https://github.com/Wutpeach/Ameow/releases/download/v0.5.0/Ameow_0.5.0_windows_x64_portable.zip) |
| macOS Apple Silicon | [Mac ZIP](https://github.com/Wutpeach/Ameow/releases/download/v0.5.0/Ameow-0.5.0-macos-arm64.zip) |

Windows 安装版完成向导后从开始菜单启动；便携版完整解压后运行 `AmeowLauncher.exe`。Mac 解压后将 `Ameow.app` 放入 `/Applications` 或 `~/Applications`，从 Finder 打开。Mac 声明最低 macOS 13，实测为 macOS 26.3 / arm64；Intel Mac、Universal 和 Linux 不在本版分发范围。

完整步骤见[下载与安装](https://wutpeach.github.io/Ameow/docs/downloads/)，本版变化见 [0.5.0 发行说明](https://github.com/Wutpeach/Ameow/releases/tag/v0.5.0)。首次下载需要联网准备组件；Mac 无需另行安装 Homebrew 或 Python。

## 下载与更新

支持 YouTube、Bilibili 公开单视频、Imgur 图片与相册、Bluesky 单帖图片；其他公开 HTTP(S) 媒体链接可交由下载器尝试。提供三档画质、最多三个并行任务、失败重试和诊断复制，也可把文件夹拖到 Full 窗口设置保存位置。网站、登录或地区限制可能影响可下载性，本版不导入浏览器登录态。

在设置的关于页检查应用更新；下载组件由组件与诊断页分别管理。Windows 通过 Launcher 启动新版本，Mac 更新完整的 `Ameow.app`。更新经过签名与完整性校验，用户数据与程序目录分离：

| 平台 | 用户数据目录 |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Ameow` |
| macOS | `~/Library/Application Support/AmeowNative` |

Rust 版与旧 Electron 版数据隔离，不自动迁移旧配置、缓存或历史，也不承诺从旧 Electron 自动升级到 Rust 版。旧版用户请按上面的平台入口安装并重新选择保存位置和偏好。历史 Electron v0.3.1 已停止维护和兼容支持。早期 Rust `AmeowNext\stage-a` 数据不会自动迁移或清理。

## 从源码运行

`rust-toolchain.toml` 固定 Rust 1.98.1。Windows x64 使用 MSVC，需 Visual Studio C++ Build Tools 与 Windows SDK；Apple Silicon Mac 需 Xcode 开发工具。在仓库根目录构建：

```sh
cargo build --locked --bin ameow
```

Windows 运行 `./target/debug/ameow.exe`，Mac 运行 `./target/debug/ameow`。Finder 启动、系统登录项和完整应用更新使用打包后的 `Ameow.app`。应用无需用户另行配置 Node、Python 或 Electron；开发与打包细节见 [CONTRIBUTING](CONTRIBUTING.md)。

## 文档与发行

文档站独立使用 Node >=22.19.0：

```sh
npm ci --prefix site
npm --prefix site run build
```

应用自有代码采用 [MIT](LICENSE)。第三方代码、字体、图标及运行时适用各自许可，见[发行材料](distribution/packaging.md)与[第三方说明](THIRD_PARTY_NOTICES.md)。Windows 安装与便携包见 [Windows 交付说明](distribution/windows-delivery.md)，Mac 打包入口为 [package_macos.sh](scripts/package_macos.sh)。构建、离线签名和公开发布分别进行；现有 CI 不上传应用资产或自动创建 Release。
