# macOS yt-dlp Runtime Split Implementation Plan

## Objective

Replace the current slow-launching macOS bundled `yt-dlp` standalone binary with a macOS-specific managed runtime path, while preserving:

- the existing renderer command surface
- the existing settings/update UX
- Windows bundled-binary behavior
- deterministic app-owned downloader execution

This plan assumes the product decision already made in [prd.md](/Users/mabel/Documents/FlowSelect/.trellis/tasks/04-20-macos-ytdlp-runtime-split/prd.md):

- Windows stays on bundled official `yt-dlp` binary
- macOS moves to an app-managed Python-package `yt-dlp` runtime

## Success Criteria

### Functional

- macOS downloads no longer execute the bundled `yt-dlp_macos` binary on the steady-state path.
- `queue_video_download` continues to work without renderer payload changes.
- `check_ytdlp_version` still returns local version, latest version, and update availability.
- `update_ytdlp` still updates the downloader from the user's point of view.
- Windows downloader resolution and updater behavior remain unchanged.

### Performance

- On macOS, managed `yt-dlp --version` warm startup should be sub-second.
- On macOS, injected YouTube downloads should no longer spend tens of seconds before the first extractor activity line appears.

### Operational

- Support logs clearly identify whether `yt-dlp` came from:
  - bundled binary
  - managed macOS package runtime
- Runtime dependency status can explain when the macOS managed yt-dlp runtime is missing, installing, failed, or ready.

## Scope

### In Scope

- macOS-only `yt-dlp` runtime resolution split
- managed Python runtime ownership for macOS `yt-dlp`
- macOS-specific `check_ytdlp_version` / `update_ytdlp` implementation
- runtime status / gate integration for macOS yt-dlp
- logging, support-log, and spec updates

### Out of Scope

- gallery-dl runtime redesign
- Windows downloader changes
- YouTube extractor strategy redesign
- UI redesign beyond status text/state accuracy

## Steady-State Architecture

## 1. Runtime Source Matrix

| Platform | Runtime source | Update source | Execution path |
|---|---|---|---|
| Windows | Bundled official standalone binary | Official upstream release asset | Direct binary spawn |
| macOS | Managed Python-package runtime | Package install/update inside app-owned venv | Managed venv entrypoint spawn |

## 2. Managed macOS Runtime Layout

Proposed layout under config dir:

```text
<configDir>/runtimes/yt-dlp/<target>/
  metadata.json
  python/
    <managed python runtime or shim>
  venv/
    bin/
      python
      yt-dlp
    ...
  install/
    <temporary/staging files>
```

`metadata.json` should contain:

```json
{
  "source": "managed-python-package",
  "ytDlpVersion": "2026.03.17",
  "pythonVersion": "3.12.x",
  "installedAtMs": 1776695330554,
  "updatedAtMs": 1776695330554,
  "runtimeTarget": "aarch64-apple-darwin"
}
```

## 3. Runtime State Model

Current runtime dependency model already handles managed components like `ffmpeg` and `deno`. `yt-dlp` on macOS should join that same philosophy.

Desired macOS yt-dlp states:

- `missing`
- `installing`
- `ready`
- `failed`

Windows can keep the existing simpler bundled status model.

## Delivery Strategy

## 1. Managed Python Ownership

Steady-state recommendation:

- FlowSelect owns a managed Python runtime for macOS.
- FlowSelect creates a venv from that runtime.
- FlowSelect installs pinned `yt-dlp` into the venv.

Reason:

- avoids user machine dependency drift
- aligns with existing managed runtime philosophy
- keeps runtime behavior app-owned and supportable

### Temporary Delivery Shortcut

If faster delivery is needed before full managed-Python work lands, a temporary internal bridge is acceptable:

- reuse a discovered system Python only on macOS
- create app-owned venv under config dir
- install `yt-dlp` there

But this should be treated as a migration bridge, not the final contract.

## 2. Update Strategy

### Windows

- unchanged:
  - fetch latest GitHub release metadata
  - download official standalone binary asset
  - replace bundled binary
  - validate with `--version`

### macOS

Replace the updater implementation, not the user-visible action:

`update_ytdlp` on macOS should:

1. ensure managed Python runtime exists
2. ensure/create venv
3. install or update `yt-dlp` inside the venv
4. validate the venv `yt-dlp --version`
5. update runtime metadata
6. emit/return the same version result shape used today

Latest-version comparison can still use the existing upstream GitHub release metadata.

## Runtime Flow Changes

## 1. Path Resolution

### Current

[runtimePaths.ts](/Users/mabel/Documents/FlowSelect/src/electron-runtime/runtimePaths.ts) resolves `yt-dlp` only from bundled locations.

### Target

Introduce platform-aware resolution:

- Windows:
  - keep current bundled lookup
- macOS:
  - resolve managed runtime first
  - if missing, report macOS yt-dlp managed runtime missing
  - do not silently prefer the slow bundled standalone path in steady state

Recommended behavior:

```ts
if (platform === "darwin") {
  return resolveManagedMacYtDlpPath();
}
return resolveBundledYtDlpPath();
```

## 2. Runtime Dependency Status

Current `RuntimeDependencyStatusSnapshot` treats `ytDlp` as bundled everywhere. That must become platform-sensitive.

### Windows

- `ytDlp.source = "bundled"`

### macOS

- `ytDlp.source = "managed"`
- status/error should describe venv/package install health

This affects:

- status refresh
- runtime gate
- settings page runtime messaging
- support-log export

## 3. Bootstrap Triggers

macOS yt-dlp managed install should follow the same gate rules as other managed runtimes:

- no aggressive startup bootstrap before visible UI
- can auto-bootstrap after first visible window if missing
- explicit retry remains available on failure states

This avoids adding a new downloader-specific bootstrap UX.

## API / Contract Preservation

The following renderer-facing commands should remain unchanged:

- `check_ytdlp_version`
- `update_ytdlp`
- `get_runtime_dependency_status`
- `get_runtime_dependency_gate_state`
- `start_runtime_dependency_bootstrap`
- `queue_video_download`

What changes:

- command internals on macOS
- local version source on macOS
- runtime path and health semantics on macOS

What must not change:

- command names
- payload shapes
- event names
- renderer invocation sites

## File / Module Plan

## Phase 1: Contract + Path Resolution

Primary files:

- [runtimePaths.ts](/Users/mabel/Documents/FlowSelect/src/electron-runtime/runtimePaths.ts)
- [contracts.ts](/Users/mabel/Documents/FlowSelect/src/electron-runtime/contracts.ts)
- [runtimeDependencies.ts](/Users/mabel/Documents/FlowSelect/src/types/runtimeDependencies.ts)
- [sidecar-runtime-contracts.md](/Users/mabel/Documents/FlowSelect/.trellis/spec/backend/sidecar-runtime-contracts.md)

Changes:

- add macOS managed yt-dlp resolution path
- distinguish bundled vs managed downloader source
- update spec to allow platform-split delivery

## Phase 2: Managed Runtime Installer

Primary files:

- [main.mts](/Users/mabel/Documents/FlowSelect/electron/main.mts)
- new helper modules under `electron/` or `src/electron-runtime/` for:
  - managed Python install
  - venv creation
  - yt-dlp package install/update
  - metadata read/write

Recommended new modules:

- `electron/managedPythonRuntime.mts`
- `electron/managedYtDlpRuntime.mts`

Changes:

- install flow
- version validation
- metadata persistence

## Phase 3: Version Check / Update Command Split

Primary files:

- [main.mts](/Users/mabel/Documents/FlowSelect/electron/main.mts)

Changes:

- keep Windows `update_ytdlp` binary-replacement flow
- add macOS package-update flow
- keep shared latest-version GitHub fetch path

## Phase 4: Execution Path Migration

Primary files:

- [runtimePaths.ts](/Users/mabel/Documents/FlowSelect/src/electron-runtime/runtimePaths.ts)
- [service.ts](/Users/mabel/Documents/FlowSelect/src/electron-runtime/service.ts)
- [ytDlpDownload.ts](/Users/mabel/Documents/FlowSelect/src/electron-runtime/ytDlpDownload.ts)

Changes:

- ensure macOS execution uses managed path
- keep existing yt-dlp invocation shape
- add runtime-source diagnostics

## Phase 5: Supportability / UI Status

Primary files:

- [SettingsPage.tsx](/Users/mabel/Documents/FlowSelect/src/pages/SettingsPage.tsx)
- support-log export in [main.mts](/Users/mabel/Documents/FlowSelect/electron/main.mts)
- runtime dependency display surfaces

Changes:

- make runtime source visible for diagnostics
- clarify missing/installing/failure states on macOS

## Migration Strategy

## Stage 0: Spec And Internal Feature Flag

- update spec first
- add a macOS-only internal runtime source switch
- keep bundled binary available only for diagnostic fallback during development

## Stage 1: Experimental macOS Managed Path

- implement managed path
- compare launch timings and stability
- keep fallback only behind explicit diagnostic switch

## Stage 2: Steady-State macOS Default

- managed path becomes the default for all macOS yt-dlp execution
- bundled standalone is no longer used automatically

## Stage 3: Cleanup

- remove diagnostic fallback if no longer needed
- shrink packaging assumptions and docs accordingly

## Test Plan

## Automated

### Path / Status

- add tests for runtime path resolution:
  - Windows bundled
  - macOS managed ready
  - macOS managed missing

### Update Commands

- mock macOS managed install/update
- assert `update_ytdlp` returns validated local version
- assert Windows path remains unchanged

### Runtime Status

- assert macOS status surfaces managed source and errors

## Manual

### macOS Fresh State

- clean config dir
- launch app
- observe yt-dlp missing/install flow
- complete install
- verify downloader version visible

### macOS Download

- run bundled timing comparison once for baseline
- run managed-path `yt-dlp --version`
- trigger YouTube injected download
- verify first extractor activity appears quickly

### Windows Regression

- run normal bundled binary download/update checks

## Risks

1. **Managed Python bootstrap complexity**
   - more moving parts than one binary replacement

2. **Spec and implementation drift**
   - current contracts explicitly assume bundled official binaries on macOS

3. **Migration ambiguity**
   - mixed states between bundled and managed macOS runtimes can confuse support logs unless source is explicit

4. **Release packaging impact**
   - if managed Python is app-owned, packaging and bootstrap assets must be planned carefully

## Mitigations

- preserve renderer contracts
- isolate Windows from changes
- keep runtime source explicit everywhere
- stage rollout with diagnostic logging
- update spec in the same task as implementation

## Recommendation

Implement this in two delivery layers:

### Layer A: Full Product Target

- app-managed Python runtime on macOS
- app-owned venv `yt-dlp`
- platform-split updater

### Layer B: Delivery Shortcut If Needed

- temporary system-Python-backed venv on macOS for rapid validation
- same external API and runtime layout principles
- later replace the Python provider, not the renderer/runtime contract

This lets us validate the design quickly without locking the product into a host-dependent long-term solution.
