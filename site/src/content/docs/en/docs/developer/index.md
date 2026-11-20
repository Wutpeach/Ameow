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

## CLI

For package availability, installation, and ordinary commands, see [Command line and agents](../cli/). Source main already contains ordinary desktop control. The developer `dev` entry requires a checkout containing [PR #61](https://github.com/Wutpeach/Ameow/pull/61). Work in a separate development directory; there is no need to switch an existing working tree you use elsewhere.

Build ordinary control with its adjacent application, using one fixed target:

~~~sh
cargo build --locked --bin ameow --bin ameow-cli --target-dir target
~~~

Run `./target/debug/ameow-cli.exe --help` in Windows PowerShell, or `./target/debug/ameow-cli --help` in Mac zsh/bash. Help does not start the app. See the repository [CLI reference](https://github.com/Wutpeach/Ameow/blob/main/docs/cli.md) for an isolated desktop instance from a source build.

For developer scenarios only, build a debug CLI with `dev-tools`. There is no setting to enable it, and release builds explicitly reject this feature. Build once in a directory containing PR #61:

~~~sh
cargo build --locked --features dev-tools --bin ameow-cli --target-dir target
~~~

Windows PowerShell:

~~~powershell
./target/debug/ameow-cli.exe dev --help
./target/debug/ameow-cli.exe dev scenario --root evidence/dev-success --case success
~~~

Mac zsh/bash:

~~~sh
./target/debug/ameow-cli dev --help
./target/debug/ameow-cli dev scenario --root evidence/dev-success --case success
~~~

Use a fresh root for each scenario. `scenario` uses a fixed offline adapter with the real task core, without a GUI or network downloads. `dev run` uses production downloaders, may prepare components and access the network, and needs a real media URL you choose. Separate candidate checkout steps, real-run examples, tool replacements, and full parameters stay in the repository [CLI developer guide](https://github.com/Wutpeach/Ameow/blob/main/docs/developer-cli.md).

## Data and test inputs {#data}

| Platform | Current user data directory |
| --- | --- |
| Windows (`LOCALAPPDATA`) | `%LOCALAPPDATA%\Ameow` |
| macOS (`HOME`) | `~/Library/Application Support/AmeowNative` |

Keep existing settings and caches; do not clear user data for development. Some real-runtime tests use `AMEOW_RUNTIME_TEST_ROOT` to point to a production-prepared cache. Follow the test source requirements; this is a test input, not a user setting.

Continue with [Testing and validation](./testing/) or [Documentation development](./docs-and-locales/).
