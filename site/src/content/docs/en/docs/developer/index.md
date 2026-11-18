---
title: For developers
description: Rust / GPUI tools, startup, and data paths.
---

This section is for contributors. To install the app, use [downloads](../downloads/). See the repository's [OpenSpec](https://github.com/Wutpeach/Ameow/blob/main/openspec/README.md) for behavior requirements and [CONTRIBUTING](https://github.com/Wutpeach/Ameow/blob/main/CONTRIBUTING.md) for contribution guidance.

## Tools and startup

`rust-toolchain.toml` pins Rust 1.98.1. Windows x64 uses MSVC and needs Visual Studio C++ Build Tools plus the Windows SDK. Apple Silicon Macs need Xcode development tools. From the repository root:

```sh
cargo build --locked --bin ameow
```

Run `./target/debug/ameow.exe` on Windows or `./target/debug/ameow` on Mac. Finder startup, system login items, and full-app updates use `Ameow.app`; prerequisites are in the [Mac packaging script](https://github.com/Wutpeach/Ameow/blob/main/scripts/package_macos.sh). Mac testing covers 26.3 arm64; the declared minimum of 13 does not establish verification on older systems.

## Data and test inputs {#data}

| Platform | Current user data directory |
| --- | --- |
| Windows (`LOCALAPPDATA`) | `%LOCALAPPDATA%\Ameow` |
| macOS (`HOME`) | `~/Library/Application Support/AmeowNative` |

Keep existing settings and caches; do not clear user data for development. Some real-runtime tests use `AMEOW_RUNTIME_TEST_ROOT` to point to a production-prepared cache. Follow the test source requirements; this is a test input, not a user setting.

Continue with [Testing and validation](./testing/) or [Documentation development](./docs-and-locales/).
