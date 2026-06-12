# Record portable runtime dependency storage evaluation

## Status

Planning note only. Do not implement code changes from this task until the user explicitly resumes it.

## User request

The user asked whether automatically bootstrapped runtime dependencies can be stored under the application directory for both portable and installed builds, whether macOS has limitations or needs special handling, and whether Chinese/non-ASCII install paths may affect dependency invocation.

After review, the user decided the change carries enough risk and maintenance cost that it should be recorded as a Trellis task but not implemented now.

## Current confirmed facts

- Current public documentation says managed dependencies are stored under `%APPDATA%\Ameow\runtimes\` on Windows, even for portable builds.
- `electron/main.mts` passes `configDir: getUserDataDir()` into both the Electron runtime environment and managed runtime bootstrap options.
- `electron/managedRuntimeBootstrap.mts` resolves managed runtime roots as `join(options.configDir, "runtimes", componentId, currentManagedRuntimeTarget(...))`.
- `src/electron-runtime/runtimePaths.ts` resolves status and command paths from `environment.configDir/runtimes/...`.
- Managed Python tools (`yt-dlp`, `gallery-dl`, `douyin-dl`) are installed into per-tool virtual environments under the managed runtime root.
- Managed `ffmpeg` and `deno` are downloaded, verified, extracted, and installed under the managed runtime root.
- Bundled Python itself is packaged with the app under `desktop-assets/binaries/python-<target>` and is resolved from repo resources, packaged resources, or executable-adjacent candidates.
- Windows portable packaging creates an `Ameow_portable` directory and writes `.ameow-portable.json` at its root.
- macOS packaging produces a `.app` inside a DMG flow; future signing/notarization should be treated as possible even if current builder config is unsigned.

## Decision recorded

Do not move all bootstrap-managed runtime dependencies into the application directory.

Preferred future direction, if this is resumed:

- Keep installed Windows builds using `userData` for dynamic runtime outputs.
- Keep macOS builds using `userData` / Application Support for dynamic runtime outputs.
- Consider only Windows portable builds for portable-root-owned runtime storage, for example `<portableRoot>/data/runtimes`.
- Keep bundled Python in packaged app resources; vary only the dynamic runtime output root.
- If portable-root storage is not writable, fall back to `userData` and log the fallback.

## Risks and constraints

- Application install directories may be read-only, permission-protected, upgrade-managed, or shared across users.
- Writing dynamic files inside or beside a macOS `.app` can conflict with signing, notarization, Gatekeeper behavior, App Translocation, DMG read-only launches, and `/Applications` permissions.
- Runtime bootstrap, status inspection, command path resolution, and version display must all agree on the same runtime root.
- `src/electron-runtime/runtimePaths.ts` currently creates runtime directories during path/status resolution via `mkdirSync`; this side effect should be revisited before adding a path strategy.
- Moving portable runtime output may cause first-run re-bootstrap for users who already have runtimes in `%APPDATA%`.
- Storing only runtimes in the portable folder while settings, logs, cookies, and sessions remain in `userData` may confuse users unless documented clearly.
- Chinese/non-ASCII paths should generally work when using Node path APIs and `spawn(command, args)`, but third-party CLI tools, Python virtualenv scripts, PowerShell extraction, or downloaded tools may still have edge cases.

## Claude consultation summary

Claude reviewed the proposed direction and agreed with the overall portable-only strategy, with these notable recommendations:

- Treat macOS as always `userData`; do not use app-adjacent writable runtime directories.
- Add a single path strategy entrypoint rather than changing one caller.
- Inject the resolved runtime config directory into both `buildElectronRuntimeEnvironment()` and `buildManagedRuntimeBootstrapOptions()`.
- Ensure status inspection and bootstrap installation use the same directory to avoid repeated false-missing states and re-downloads.
- Add a writable check for the portable runtime directory and fall back to `userData` on failure.
- Update docs if portable runtime storage changes.
- Add focused tests for Windows portable, Windows installed, macOS, read-only portable roots, and Chinese/non-ASCII paths.

Local follow-up note: Claude mentioned `electron/downloaderVersionInfo.mts` as a separate path calculation layer. Current code primarily uses runtime status entrypoints to derive metadata roots, so this claim should be rechecked during implementation rather than accepted blindly.

## Acceptance criteria for any future implementation

- No behavior changes occur until this task is explicitly resumed and moved into implementation.
- Windows installed builds continue to store dynamic managed runtimes under `userData`.
- macOS builds continue to store dynamic managed runtimes under `userData` / Application Support.
- Windows portable builds, if enabled, store dynamic managed runtimes under a portable-root-owned directory only when that directory is writable.
- Runtime bootstrap, status inspection, command invocation, and version/info UI all report and use the same runtime paths.
- Portable runtime fallback to `userData` is logged and recoverable.
- Documentation explains the runtime directory behavior for installed, portable, and macOS builds.
- Tests or manual checks cover Chinese/non-ASCII portable paths and installed paths.

## Out of scope for now

- Implementing portable runtime co-location.
- Moving settings, logs, sessions, cookies, or browser state into the portable folder.
- Changing bundled Python packaging.
- Changing macOS packaging or signing behavior.
- Migrating existing `%APPDATA%\Ameow\runtimes` contents into a portable directory.

