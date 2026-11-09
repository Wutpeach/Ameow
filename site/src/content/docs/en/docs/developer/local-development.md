---
title: Local development
description: Run the Rust application from source on Windows x64.
---

Install Rust 1.93.0, Visual Studio C++ Build Tools, and the Windows SDK on Windows x64. `rust-toolchain.toml` pins the Rust toolchain. The application itself does not depend on Node, Python, or Electron.

From the repository root:

```powershell
cargo build --locked
./target/debug/ameow.exe
```

Paste a public single-video YouTube or Bilibili link into the application. The old browser extension does not connect to Rust. Settings, runtime selection, cache, and history are kept in `%LOCALAPPDATA%\Ameow`; do not clear existing data for development.

`src/` contains application code, `tests/` integration tests, `assets/` embedded assets and the runtime manifest, and `distribution/` packaging material. The independent `site/` uses Node; see [site development](../docs-and-locales/). Native macOS and Linux operation is unverified.
