---
title: Developer guide
description: Rust / GPUI development and project contracts.
---

The current source is the Rust / GPUI application at the repository root, with native verification on Windows x64 / MSVC and macOS Apple Silicon. Mac testing covers macOS 26.3 only; the declared macOS 13 minimum does not establish verification on older systems. Intel, Universal, and Linux are outside the currently verified scope. Rust 0.5.0 has not been officially released, with no public installer or signed update feed. [Electron v0.3.1](https://github.com/Wutpeach/Ameow/releases/tag/v0.3.1) is discontinued and unsupported.

- [Local development](./local-development/): toolchain and launch.
- [Environment variables](./environment-variables/): data path and test inputs.
- [Testing](./testing/): validation scope and native UI.
- [Documentation and locales](./docs-and-locales/): independent site development and deployment.

See [CONTRIBUTING](https://github.com/Wutpeach/Ameow/blob/main/CONTRIBUTING.md) and the [Rust contract index](https://github.com/Wutpeach/Ameow/blob/main/openspec/README.md) for source structure and constraints. Availability of former handoffs and validation materials is explained in [Engineering docs and history](https://github.com/Wutpeach/Ameow/blob/main/docs/README.md). Historical Electron source is available at the [v0.3.1 tag](https://github.com/Wutpeach/Ameow/tree/v0.3.1).
