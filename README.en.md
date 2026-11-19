# Ameow

Ameow is a Rust / GPUI floating download app for Windows x64 and Apple Silicon Mac. Paste a public media link, manage the queue, and choose quality and a save folder. When idle, the cat returns to the Compact window.

[简体中文](README.md) · [User manual](https://wutpeach.github.io/Ameow/en/docs/) · [Development](CONTRIBUTING.md)

## Download and install

| Ameow 0.5.0 | Download |
| --- | --- |
| Windows x64 installer | [Installer](https://github.com/Wutpeach/Ameow/releases/download/v0.5.0/Ameow_0.5.0_windows_x64_installer.exe) |
| Windows x64 portable | [Portable ZIP](https://github.com/Wutpeach/Ameow/releases/download/v0.5.0/Ameow_0.5.0_windows_x64_portable.zip) |
| macOS Apple Silicon | [Mac ZIP](https://github.com/Wutpeach/Ameow/releases/download/v0.5.0/Ameow-0.5.0-macos-arm64.zip) |

On Windows, finish the installer and launch from the Start menu, or extract the entire portable ZIP and run `AmeowLauncher.exe`. On Mac, extract the ZIP, move `Ameow.app` to `/Applications` or `~/Applications`, and open it from Finder. macOS 13 is the declared minimum; testing covers macOS 26.3 / arm64. Intel Macs, Universal, and Linux are outside this release's distribution scope.

See [download and installation instructions](https://wutpeach.github.io/Ameow/en/docs/downloads/) and the [0.5.0 release notes](https://github.com/Wutpeach/Ameow/releases/tag/v0.5.0). First use requires a network connection to prepare download components. Mac users do not need to install Homebrew or Python separately.

## Downloads and updates

Supported inputs include public single videos on YouTube and Bilibili, Imgur images and albums, and images in a single Bluesky post. Other public HTTP(S) media links can be passed to the downloader to try. Choose from three quality presets, run up to three tasks at once, retry failed downloads, or copy diagnostics. Drop a folder onto Full to change the save location. Website, login, and regional restrictions can affect availability; this version does not import browser login sessions.

Check application updates in About. Download components are managed separately in Components. Windows launches new versions through the Launcher; Mac updates the complete `Ameow.app`. Updates use signature and integrity checks, and user data is stored separately from program files:

| Platform | User data directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Ameow` |
| macOS | `~/Library/Application Support/AmeowNative` |

The Rust app keeps its data separate from the old Electron app. It does not automatically migrate old settings, caches, or history, and automatic upgrades from Electron to Rust are not promised. Install the package for your platform above, then choose your save folder and preferences again. Historical Electron v0.3.1 is no longer maintained or supported. Early Rust `AmeowNext\stage-a` data is neither automatically migrated nor cleaned.

## Build and run

`rust-toolchain.toml` pins Rust 1.98.1. Windows x64 uses MSVC and needs Visual Studio C++ Build Tools plus the Windows SDK. Apple Silicon Macs need Xcode development tools. From the repository root:

```sh
cargo build --locked --bin ameow
```

Run `./target/debug/ameow.exe` on Windows or `./target/debug/ameow` on Mac. Finder startup, system login items, and full-app updates use the packaged `Ameow.app`. Users do not need to configure Node, Python, or Electron separately. See [CONTRIBUTING](CONTRIBUTING.md) for development and packaging details.

## Documentation and distribution

The site has its own Node >=22.19.0 dependencies:

```sh
npm ci --prefix site
npm --prefix site run build
```

Application code is [MIT](LICENSE); third-party code, fonts, icons, and runtimes retain their own licenses. See [packaging](distribution/packaging.md) and [notices](THIRD_PARTY_NOTICES.md). Use [Windows delivery](distribution/windows-delivery.md) for installer and portable packaging, and [package_macos.sh](scripts/package_macos.sh) for Mac. Building, offline signing, and public release are separate operations. CI does not upload application assets or automatically create releases.
