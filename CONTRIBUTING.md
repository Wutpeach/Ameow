# Development

Use the repository root for Rust work. `rust-toolchain.toml` pins Rust 1.98.1. Windows x64 uses MSVC and requires Visual Studio C++ Build Tools and the Windows SDK. Apple Silicon Mac development requires Xcode development tools. The declared Mac minimum is macOS 13; native testing covers macOS 26.3 / arm64, not every older supported system. Intel Mac, Universal, and Linux are outside the current distribution scope.

- `src/`, `tests/`, `examples/`: application, contracts and development probes.
- `assets/`: embedded brand assets, fonts, trust material and runtime manifest.
- `distribution/`: license material and release packaging guidance.
- `scripts/`: retained native validation/capture tools and packaging entry.
- `site/`: independent Astro/Starlight site and lockfile.
- `openspec/specs/`: the only active formal contracts; start at [OpenSpec](openspec/README.md).
- [Spec maintenance](docs/spec-maintenance.md): update rules and validation scope.
- [Engineering guides](docs/README.md): preview tools and platform packaging.
- [Development CLI](docs/developer-cli.md): isolated finite runs, offline scenarios, evidence and tool replacements.

## Local builds on a daily-use computer

Keep everyday applications responsive. For agent/task-initiated builds, checks, tests and packaging, run one heavy operation at a time per machine, use four Cargo jobs and lower only the build process priority. Coordinate with other tasks before starting; wait for an existing build to finish. These local commands do not change CI settings.

The user Cargo configuration (`%USERPROFILE%/.cargo/config.toml` on Windows, `~/.cargo/config.toml` on Mac) can set this default for ordinary `cargo run` too:

```toml
[build]
jobs = 4
```

Preserve all other configuration and back up the original bytes and permissions before editing. This applies to subsequent Cargo invocations, including other projects using that user configuration; already running builds keep their settings. Command-line `--jobs`, `CARGO_BUILD_JOBS` and nearer Cargo configuration can override the default. Four jobs limits Cargo concurrency, not four CPU cores or a fixed CPU percentage. The linker and individual tools may still use multiple threads. If linking still disrupts daily use, first identify the active linker and then consider a local linker-specific thread limit; do not change compiler flags, profiles, caches, affinity or power settings preemptively.

On Windows, use an independent PowerShell process that sets its own priority before starting Cargo. The parent terminal and later application launches keep their normal priority. Run from the repository root:

```powershell
powershell -NoProfile -Command '
    $ErrorActionPreference = [System.Management.Automation.ActionPreference]::Stop
    [Diagnostics.Process]::GetCurrentProcess().PriorityClass = [Diagnostics.ProcessPriorityClass]::BelowNormal
    cargo check --locked --all-targets --jobs 4
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    cargo test --locked --jobs 4
    exit $LASTEXITCODE
'
```

For a targeted check or test, replace the Cargo lines with the narrow command needed and keep the exit-code check. To build and then run the app at normal priority:

```powershell
powershell -NoProfile -Command '
    $ErrorActionPreference = [System.Management.Automation.ActionPreference]::Stop
    [Diagnostics.Process]::GetCurrentProcess().PriorityClass = [Diagnostics.ProcessPriorityClass]::BelowNormal
    cargo build --locked --bin ameow --jobs 4
    exit $LASTEXITCODE
'
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
./target/debug/ameow.exe
```

On Mac, use `nice` for each build operation, then launch the application from the normal parent shell after a successful build:

```sh
nice -n 10 cargo check --locked --all-targets --jobs 4 &&
nice -n 10 cargo test --locked --jobs 4

nice -n 10 cargo build --locked --bin ameow --jobs 4 &&
./target/debug/ameow
```

Do not put `cargo run` or an application launch inside the lower-priority shell or `nice` command: the application would inherit the build priority. For local npm builds or other packaging tools, put the build command in the same Windows child shell, or prefix it with `nice -n 10` on Mac. Start any persistent preview or user application separately at normal priority. Background helpers must stay hidden and be waited for or cleaned up.

A Cargo executable is a development entry; Windows distributions start through `AmeowLauncher.exe`, while Finder startup, system login items, and full-app updates on Mac use `Ameow.app`. Build `ameow`, `ameow-updater`, `ameow-cli`, and `ameow-browser-host` using the same reduced-priority commands before using [package_macos.sh](scripts/package_macos.sh); see the [developer manual](https://wutpeach.github.io/Ameow/en/docs/developer/) for platform and data-path details.

Run the narrowest relevant test first. Genuine runtime/media tests are explicitly ignored by default and require their documented inputs; ignored is not PASS. Native UI changes require running the affected workflow. Existing accepted evidence can be reused when its source and behavior remain applicable.

Optional Windows screenshot tools need Python, Tk and Pillow; see [UI_REGRESSION.md](scripts/UI_REGRESSION.md). They can move the real pointer and should run only on their owned process. Preserve accepted executables with a separate target/output directory. They are development tools, not product acceptance or cross-platform proof.

The Windows build entry prepares unsigned release inputs; signing and publication are separate:

```powershell
powershell -NoProfile -Command '
    $ErrorActionPreference = [System.Management.Automation.ActionPreference]::Stop
    [Diagnostics.Process]::GetCurrentProcess().PriorityClass = [Diagnostics.ProcessPriorityClass]::BelowNormal
    $env:CARGO_BUILD_JOBS = 4
    & ./scripts/package_portable.ps1 -TargetDirectory D:/task/ameow-target -OutputDirectory D:/task/ameow-build-evidence
    exit $LASTEXITCODE
'
```

Use separate build and output paths outside the source checkout when preparing release inputs; ordinary local builds reuse the existing target. Full packaging and signing steps are in [distribution/packaging.md](distribution/packaging.md) and [Windows delivery](distribution/windows-delivery.md). Mac packaging uses `nice -n 10 ./scripts/package_macos.sh <executable> <new-app-path>` on an Apple Silicon Mac, after building its inputs as above. Verify each release candidate's identity and affected workflows. CI checks Windows Rust and builds Pages; it does not publish application releases.

Keep application build identity separate from later documentation-only commits. After publication is authorized, publish the approved application tag/release and its matching assets before merging download-link changes; a site change on `main` deploys Pages. A draft pull request builds the site without deploying it. Check public asset availability after release; proposed URLs and successful builds do not establish availability.

The browser extension has a maintained Popup workbench at http://127.0.0.1:4322/.
In the native Gallery, choose **扩展 Popup → 打开预览** to start or reuse the
current checkout's service and open the workbench. Gallery only stops a service
it started. Node.js and the extension dependencies must be installed.
You can also start it from the repository root:

    npm --prefix browser-extension run preview

It loads current Popup sources at actual dimensions with selectable synthetic
states, themes and languages. See the [Popup preview guide](browser-extension/preview/README.md)
for use and checks.

The site requires Node >=22.19.0. Use `npm ci --prefix site`, `npm --prefix site run dev` or `npm --prefix site run build`; no root Node package is needed.

Keep development discussions and delivery results in the relevant Issue/PR. Use a separate task directory or the ignored root `evidence/` directory for temporary validation output; `docs/` holds maintained engineering guides. Historical reports describe their original candidates and environments. Preserve unrelated working changes, user data and existing release assets.
