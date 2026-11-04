---
title: Environment variables
description: Current Rust data path and test-only inputs.
---

The Rust application uses Windows `LOCALAPPDATA` to locate `%LOCALAPPDATA%\AmeowNext\stage-a`, retaining existing settings, cache, and history. This is not the old Electron configuration, which is not automatically imported.

Some ignored real-runtime tests use `AMEOW_RUNTIME_TEST_ROOT` to point to a production-prepared cache; see the test source for requirements. It is a test input, not a normal user setting. Other test tools may have their own inputs; read their source and instructions before running them.

The old Electron development server, screenshot, and extension variables do not apply to the current Rust application. See the historical [v0.3.1 source](https://github.com/Wutpeach/Ameow/tree/v0.3.1).
