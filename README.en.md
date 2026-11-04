# Ameow

Ameow is a Rust / GPUI floating download application for Windows. This repository maintains the Rust development baseline; [#18](https://github.com/Wutpeach/Ameow/issues/18) records the main-branch takeover.

**The public download remains [Electron v0.3.1](https://github.com/Wutpeach/Ameow/releases/tag/v0.3.1). There is no public Rust installer yet.** Existing tags, releases and recoverable history remain available. The historical browser extension is not integrated with the Rust application.

[简体中文](README.md) · [Documentation](https://wutpeach.github.io/Ameow/en/docs/) · [Development](CONTRIBUTING.md) · [Preservation and handoff](docs/repository-handoff.md)

## Build and run

Windows x64/MSVC is the current native target. Install Rust 1.93.0, Visual Studio C++ Build Tools and the Windows SDK. Node, Python and Electron are not application dependencies.

```powershell
cargo build --locked
./target/debug/ameow.exe
```

The accepted Rust baseline provides single-video YouTube/Bilibili input, a queue, settings and a tray. Download components are prepared and verified against the embedded manifest; yt-dlp updates require explicit discovery and selection. Refer to the original Issue evidence for verified behavior and remaining limitations; the Rust application does not claim every historical Electron feature.

## Existing data and startup

`%LOCALAPPDATA%\AmeowNext\stage-a` remains the settings, runtime selection, cache and history directory. Internal `AmeowNext` single-instance and startup identifiers are retained for compatibility. No user data is moved or erased, and Electron settings are not imported.

The delivered executable is `Ameow.exe` (Cargo emits `ameow.exe`). Exit the old application normally before opening the renamed version. Recreate shortcuts and pinned taskbar entries. If login startup was enabled, enable it again in the new application's settings and verify its state; no new startup registration is made automatically. External shortcuts are not migrated. Actual sign-out/sign-in startup has not been tested in this takeover.

## Documentation and distribution

The site has its own Node >=22.19.0 dependencies:

```powershell
npm ci --prefix site
npm --prefix site run build
```

The existing Pages address is retained. The site documents current Rust source and distinguishes it from the historical Electron v0.3.1 public release. [#19](https://github.com/Wutpeach/Ameow/issues/19) tracks documentation maintenance. Future page-selection research belongs to [#22](https://github.com/Wutpeach/Ameow/issues/22).

Application code is [MIT](LICENSE); third-party materials retain their own licenses. See [packaging](distribution/packaging.md) and [notices](THIRD_PARTY_NOTICES.md). A successful build does not authorize redistribution. Private packaging needs a review bound to the current inputs; public Gate B remains blocked. No workflow automatically publishes installers.
