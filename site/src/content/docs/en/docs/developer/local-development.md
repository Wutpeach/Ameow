---
title: Local development
description: Run the Rust application from source on Windows x64 or Apple Silicon Mac.
---

The repository's `rust-toolchain.toml` pins Rust 1.98.1. The app itself does not depend on Node, Python, or Electron; it prepares its own download components. Run the following commands at the repository root.

## Windows x64 / MSVC

Install Rust, Visual Studio C++ Build Tools, and the Windows SDK, using the MSVC toolchain:

```powershell
cargo build --locked --bin ameow
./target/debug/ameow.exe
```

## macOS Apple Silicon / arm64

Install Rust and the Xcode development tools on an Apple Silicon Mac and ensure the active Xcode toolchain is available:

```sh
cargo build --locked --bin ameow
./target/debug/ameow
```

The source executable is for development. Finder startup, system login items, and full-app updates use `Ameow.app`. See the repository's [macOS packaging script](https://github.com/Wutpeach/Ameow/blob/main/scripts/package_macos.sh) for the app-bundle entry and prerequisites. A local test bundle is not an official release. Only macOS 26.3 arm64 has been tested; the declared macOS 13 minimum does not establish verification on older systems. Intel, Universal, and Linux are outside the currently verified scope.

## Usage and data

Paste public media links with `Ctrl+V` on Windows or `Command+V` on Mac; see [supported sites](../../extension/supported-sites/) for scope. The old browser extension does not connect to Rust.

Settings, runtime selection, cache, and history live in the current user's directory: `%LOCALAPPDATA%\Ameow` on Windows and `~/Library/Application Support/AmeowNative` on macOS. Do not clear existing data for development. Rust does not automatically import old Electron configuration.

`src/` contains application code, `tests/` integration tests, `assets/` embedded assets and the runtime manifest, and `distribution/` packaging material. The independent `site/` uses Node; see [site development](../docs-and-locales/).
