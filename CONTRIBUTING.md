# Development

Use the repository root for Rust work. `rust-toolchain.toml` pins Rust 1.98.1. Windows x64 uses MSVC and requires Visual Studio C++ Build Tools and the Windows SDK. Apple Silicon Mac development requires Xcode development tools. The declared Mac minimum is macOS 13; native testing covers macOS 26.3 / arm64, not every older supported system. Intel Mac, Universal, and Linux are outside the 0.5.0 distribution scope.

- `src/`, `tests/`, `examples/`: application, contracts and development probes.
- `assets/`: embedded brand assets, fonts, trust material and runtime manifest.
- `distribution/`: license material and release packaging guidance.
- `scripts/`: retained native validation/capture tools and packaging entry.
- `site/`: independent Astro/Starlight site and lockfile.
- `openspec/specs/`: the only active formal contracts; start at [OpenSpec](openspec/README.md).
- [Spec maintenance](docs/spec-maintenance.md): update rules and validation scope.
- [Engineering guides](docs/README.md): preview tools and platform packaging.
- [Development CLI](docs/developer-cli.md): isolated finite runs, offline scenarios, evidence and tool replacements.

```powershell
cargo check --locked --all-targets
cargo test --locked
```

Build the app with `cargo build --locked --bin ameow`, then run `./target/debug/ameow.exe` on Windows or `./target/debug/ameow` on Mac. A Cargo executable is a development entry; Windows distributions start through `AmeowLauncher.exe`, while Finder startup, system login items, and full-app updates on Mac use `Ameow.app`. Build `ameow`, `ameow-updater`, `ameow-cli`, and `ameow-browser-host` before using [package_macos.sh](scripts/package_macos.sh); see the [developer manual](https://wutpeach.github.io/Ameow/en/docs/developer/) for platform and data-path details.

Run the narrowest relevant test first. Genuine runtime/media tests are explicitly ignored by default and require their documented inputs; ignored is not PASS. Native UI changes require running the affected workflow. Existing accepted evidence can be reused when its source and behavior remain applicable.

Optional Windows screenshot tools need Python, Tk and Pillow; see [UI_REGRESSION.md](scripts/UI_REGRESSION.md). They can move the real pointer and should run only on their owned process. Preserve accepted executables with a separate target/output directory. They are development tools, not product acceptance or cross-platform proof.

The Windows build entry prepares unsigned release inputs; signing and publication are separate:

```powershell
./scripts/package_portable.ps1 -TargetDirectory D:/task/ameow-target -OutputDirectory D:/task/ameow-build-evidence
```

Use separate build and output paths outside the source checkout. Full packaging and signing steps are in [distribution/packaging.md](distribution/packaging.md) and [Windows delivery](distribution/windows-delivery.md). Mac packaging uses [package_macos.sh](scripts/package_macos.sh) on an Apple Silicon Mac. Verify each release candidate's identity and affected workflows. CI checks Windows Rust and builds Pages; it does not publish application releases.

Keep application build identity separate from later documentation-only commits. After publication is authorized, publish the approved application tag/release and its matching assets before merging download-link changes; a site change on `main` deploys Pages. A draft pull request builds the site without deploying it. Check public asset availability after release; proposed URLs and successful builds do not establish availability.

The browser extension has a maintained Popup workbench at http://127.0.0.1:4322/.
Start it from the repository root after installing the extension dependencies:

    npm --prefix browser-extension run preview

It loads current Popup sources at actual dimensions with selectable synthetic
states, themes and languages. See the [Popup preview guide](browser-extension/preview/README.md)
for use and checks.

The site requires Node >=22.19.0. Use `npm ci --prefix site`, `npm --prefix site run dev` or `npm --prefix site run build`; no root Node package is needed.

Keep development discussions and delivery results in the relevant Issue/PR. Use a separate task directory or the ignored root `evidence/` directory for temporary validation output; `docs/` holds maintained engineering guides. Historical reports describe their original candidates and environments. Preserve unrelated working changes, user data and existing release assets.
