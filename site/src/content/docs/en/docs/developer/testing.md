---
title: Testing and validation
description: Run Rust checks and understand their scope.
---

Run the test closest to your change first. Common full checks from the repository root are:

```powershell
cargo check --locked --all-targets
cargo test --locked
```

`tests/` includes download contracts and Windows process tests. Tests requiring real runtime or media inputs are ignored by default and need their documented inputs; ignored does not mean passed. Native UI changes also need the affected workflow exercised in the application: builds and unit tests alone do not prove UI behavior.

macOS native verification separately covers windows, menu bar, download components, and full-app updates on Apple Silicon; see the [macos-native spec](https://github.com/Wutpeach/Ameow/blob/main/openspec/specs/macos-native/spec.md). The tested system is macOS 26.3. A minimum-version declaration or results from another platform cannot replace native evidence on older systems.

See [UI_REGRESSION.md](https://github.com/Wutpeach/Ameow/blob/main/scripts/UI_REGRESSION.md) for Windows screenshot tools and dependencies. Use separate output directories and preserve accepted executables and historical evidence. See [distribution/packaging.md](https://github.com/Wutpeach/Ameow/blob/main/distribution/packaging.md) for private packaging and public release limits.

[Back to developer resources](../)
