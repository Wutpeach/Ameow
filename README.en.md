# Ameow

Ameow is a Rust / GPUI floating download application for Windows. This repository maintains the Rust development baseline; [#18](https://github.com/Wutpeach/Ameow/issues/18) records the main-branch takeover.

**Rust has not been officially released.** A default light Inno Setup installer and Launcher-based portable ZIP for Windows x64 are under controlled validation; production signing and public-release restrictions remain in place. [Electron v0.3.1](https://github.com/Wutpeach/Ameow/releases/tag/v0.3.1) is an unsupported historical release, with no maintenance, upgrades or compatibility support.

[简体中文](README.md) · [Documentation](https://wutpeach.github.io/Ameow/en/docs/) · [Development](CONTRIBUTING.md) · [Preservation and handoff](docs/repository-handoff.md)

## Build and run

Windows x64/MSVC is the current native target. Install Rust 1.93.0, Visual Studio C++ Build Tools and the Windows SDK. Node, Python and Electron are not application dependencies.

```powershell
cargo build --locked
./target/debug/ameow.exe
```

The accepted Rust baseline provides single-video YouTube/Bilibili input, a queue, settings and a tray. Download components are prepared and verified against the embedded manifest; yt-dlp updates require explicit discovery and selection. Refer to the original Issue evidence for verified behavior and remaining limitations; the Rust application does not claim every historical Electron feature.

## Existing data and startup

Current settings, runtime selection and cache use `%LOCALAPPDATA%\Ameow`, separately from program files. Old `AmeowNext\stage-a` data is neither migrated nor cleaned, and Electron settings are not imported. Current single-instance and startup identities use `Ameow`; recognized early Rust `AmeowNext` startup entries are retired only when the user changes the startup option.

The distribution entry is the stable `AmeowLauncher.exe`, with the app in `versions/<version>/Ameow.exe`. The installer defaults to `%LOCALAPPDATA%\Programs\Ameow`; extract the entire portable ZIP before use. Source builds may still run Cargo's `ameow.exe` directly. Exit normally before installing, updating or moving the app. Startup is opt-in; external shortcuts are not migrated. Actual sign-out/sign-in startup remains unverified.

## Documentation and distribution

The site has its own Node >=22.19.0 dependencies:

```powershell
npm ci --prefix site
npm --prefix site run build
```

The existing Pages address is retained. The site documents current Rust source; historical Electron v0.3.1 is no longer supported. [#19](https://github.com/Wutpeach/Ameow/issues/19) tracks documentation maintenance. Future page-selection research belongs to [#22](https://github.com/Wutpeach/Ameow/issues/22).

Application code is [MIT](LICENSE); third-party materials retain their own licenses. See [packaging](distribution/packaging.md) and [notices](THIRD_PARTY_NOTICES.md). A successful build does not authorize redistribution. Private packaging needs a review bound to the current inputs; public Gate B remains blocked. See [Windows delivery](distribution/windows-delivery.md) for controlled dual-asset builds and the manual release handoff. CI uploads no EXE/ZIP and does not publish releases.
