---
title: Environment variables
description: Current Rust data path and test-only inputs.
---

The Rust application locates the current user's settings, cache, and history by platform:

| Platform | Path source | Data directory |
| --- | --- | --- |
| Windows | `LOCALAPPDATA` | `%LOCALAPPDATA%\Ameow` |
| macOS | `HOME` | `~/Library/Application Support/AmeowNative` |

These directories are isolated from old Electron configuration, which is not automatically imported. Keep existing data rather than clearing it for routine development or troubleshooting.

Some ignored real-runtime tests use `AMEOW_RUNTIME_TEST_ROOT` to point to a production-prepared cache; see the test source for requirements. It is a test input, not a normal user setting. Other test tools may have their own inputs; read their source and instructions before running them.

The old Electron development server, screenshot, and extension variables do not apply to the current Rust application. See the historical [v0.3.1 source](https://github.com/Wutpeach/Ameow/tree/v0.3.1).
