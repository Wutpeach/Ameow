# Split macOS yt-dlp Runtime From Bundled Binary Delivery

## Goal

Fix the severe macOS YouTube startup latency caused by the current bundled `yt-dlp` standalone binary, while preserving the existing user-facing `check_ytdlp_version` / `update_ytdlp` product surface and keeping Windows on the current stable binary path.

## Problem Summary

FlowSelect currently treats `yt-dlp` as a bundled downloader runtime on both Windows and macOS. This design was originally chosen for good reasons:

- no dependency on user-installed Python / pip / Homebrew
- one unified cross-platform supply chain
- one unified updater path against official upstream release assets
- deterministic behavior via `--ignore-config`

However, current macOS measurements show that the bundled standalone binary is the dominant performance bottleneck:

- Electron runtime enters yt-dlp execution in ~`1ms`
- first extractor activity appears only after ~`42.8s`
- `desktop-assets/binaries/yt-dlp-aarch64-apple-darwin --version` takes ~`30.9s`
- the same `yt-dlp==2026.03.17` installed in a Python venv starts in ~`127ms` on warm runs

This means the main latency problem is no longer the FlowSelect orchestration or YouTube selector complexity. The macOS standalone binary itself is slow to launch on the tested environment.

## What We Know

### Observed Evidence

- Current bundled macOS binary path:
  - `desktop-assets/binaries/yt-dlp-aarch64-apple-darwin`
- The binary is a universal Mach-O with ad-hoc signing.
- `spctl --assess` returns `rejected` for the current bundled binary on the test machine.
- Copying the same file to `/tmp` or removing xattrs did not materially fix startup latency.
- A Python-package install of the same yt-dlp version behaves normally.

### Current Runtime / Update Design

Current code + spec assume:

- `yt-dlp` remains a bundled runtime under `desktop-assets/binaries/` in dev and `binaries/` in packaged builds
- updater downloads official upstream release assets and replaces the local bundled binary
- version checks run `<binary> --version` directly against that bundled file

Relevant references:

- runtime path resolution:
  - [runtimePaths.ts](/Users/mabel/Documents/FlowSelect/src/electron-runtime/runtimePaths.ts)
- updater/version checks:
  - [main.mts](/Users/mabel/Documents/FlowSelect/electron/main.mts#L3708)
- current spec contract:
  - [sidecar-runtime-contracts.md](/Users/mabel/Documents/FlowSelect/.trellis/spec/backend/sidecar-runtime-contracts.md)

## Why The Original Bundled Binary Design Existed

This is not accidental or "wrong by default". The original design solved real product needs:

1. **Cross-platform consistency**
   - Windows and macOS both used the same "official upstream binary -> stable internal name" flow.

2. **No Python dependency for end users**
   - App startup and downloads do not require Python, pip, or virtual environment setup.

3. **Updater simplicity**
   - `check_ytdlp_version` compares the local bundled binary version to upstream GitHub releases.
   - `update_ytdlp` downloads the platform asset and replaces one file in place.

4. **Deterministic execution**
   - The app owns the binary path and invokes it with `--ignore-config`.
   - Behavior does not depend on the host machine's shell/PATH or user config.

These benefits remain valid, especially on Windows.

## Non-Goal

- Do not redesign YouTube extractor strategy in this task.
- Do not replace Windows downloader delivery.
- Do not remove the existing settings UI or user-facing updater actions.
- Do not require users to preinstall Python themselves.

## Decision

Adopt a **platform-split yt-dlp runtime model**:

- **Windows** stays on the current bundled official binary path.
- **macOS** moves to an app-managed Python-package yt-dlp runtime.

The product surface stays stable:

- `check_ytdlp_version`
- `update_ytdlp`
- runtime status UI

But the macOS implementation behind those commands changes from:

- "replace bundled `yt-dlp_macos` binary"

to:

- "manage a Python venv + install/update `yt-dlp` package inside it"

## High-Level Design

## 1. Runtime Ownership Model

### Windows

Keep current behavior:

- bundled official upstream binary
- version check via local binary `--version`
- update by downloading upstream binary asset and replacing local file

### macOS

Introduce a managed runtime root, for example:

```text
<configDir>/runtimes/yt-dlp/<target>/
  bin/
    yt-dlp
  venv/
    ...
  metadata.json
```

Ownership:

- the app creates and owns the venv
- the app installs a pinned `yt-dlp` Python package into that venv
- runtime path resolution on macOS points to the venv entrypoint, not the bundled standalone binary

## 2. Python Runtime Strategy

Two viable implementation options exist:

### Option A: Reuse system Python if available

Pros:

- smaller implementation
- no extra packaged Python payload

Cons:

- fragile across machines
- depends on user Python availability and local policy
- contradicts the original "no Python dependency" product intent

### Option B: App-managed Python runtime for macOS

Pros:

- deterministic
- keeps user experience aligned with current managed-runtime philosophy (`ffmpeg`, `deno`)
- avoids machine-specific Python drift

Cons:

- more implementation work
- larger runtime footprint

**Decision**: target Option B for the final product direction.

If we want a fast stopgap, Option A can be used only as a temporary internal experiment, not as the desired steady-state contract.

## 3. Version Check Behavior

User-facing semantics should not change:

- Settings still show local version + latest version + update availability.

Implementation split:

### Windows

- unchanged: run bundled binary with `--version`

### macOS

- resolve managed venv yt-dlp entrypoint
- run `yt-dlp --version` from that managed runtime
- compare against upstream GitHub release tag exactly as today

This means `check_ytdlp_version` still exists and still returns the same payload shape. Only the local version source changes.

## 4. Update Behavior

### Windows

- unchanged

### macOS

`update_ytdlp` should become:

1. ensure managed Python runtime exists
2. update/install `yt-dlp` package inside the managed venv to the target version
3. validate by running the managed entrypoint with `--version`
4. persist metadata for diagnostics

This preserves the current user action:

- user clicks "Update yt-dlp"
- app updates yt-dlp

but changes the underlying implementation from "download standalone binary" to "update managed package".

## 5. Runtime Path Resolution

Current runtime path logic in [runtimePaths.ts](/Users/mabel/Documents/FlowSelect/src/electron-runtime/runtimePaths.ts) assumes `yt-dlp` is bundled everywhere.

New contract:

- Windows:
  - keep bundled path candidates
- macOS:
  - prefer managed runtime path
  - optionally keep bundled standalone only as a last-resort diagnostic fallback during migration

Recommended migration contract:

```ts
if (platform === "darwin") {
  resolve managed yt-dlp first
  if missing, report managed-runtime missing
} else {
  resolve bundled yt-dlp as today
}
```

Do not silently fall back to the slow bundled macOS binary in steady state, or the latency regression can reappear without visibility.

## 6. Bootstrap / First-Run UX

Because macOS yt-dlp would become a managed runtime, it should follow the existing runtime-gate philosophy already used by `ffmpeg` and `deno`:

- missing runtime is inspectable
- bootstrap happens after the UI is visible or on explicit user retry
- runtime download/install uses Electron session fetch so system proxy/PAC still apply

This avoids introducing a new special-case UX just for yt-dlp on macOS.

## 7. Logging / Diagnostics

Add explicit runtime-source diagnostics:

```ts
{
  tool: "yt-dlp",
  platform: "darwin",
  source: "managed-python-package" | "bundled-binary",
  executablePath: "...",
  version: "2026.03.17"
}
```

This must appear in:

- runtime logs
- support-log export
- updater logs

so future debugging can immediately distinguish "slow standalone binary" from "managed package path".

## Why This Should Not Break The Update Feature

The **UI feature** and the **implementation path** are different layers.

What users care about:

- can the app show local yt-dlp version?
- can the app check for a new version?
- can the app update yt-dlp with one action?

All three remain possible after the split.

What changes is only:

- where the local executable lives on macOS
- how `update_ytdlp` refreshes it

So the answer is:

- yes, the current implementation is tightly coupled to bundled binaries
- no, the updater feature itself does not have to disappear
- but we must explicitly redesign the macOS updater path instead of pretending the old binary-replacement model still applies unchanged

## Required Contract Changes

Current spec explicitly says macOS and Windows must both use official upstream release assets and not Python wrapper/package paths. That contract must change.

New desired rule:

- Windows:
  - official bundled upstream binary remains the source of truth
- macOS:
  - official upstream version metadata remains the source of truth for latest-version comparison
  - executable delivery may come from an app-managed Python-package installation

This means:

- updater/version contracts stay cross-platform at the product level
- runtime delivery implementation becomes platform-specific

## Migration Plan

### Phase 1: Design / Spec

- update runtime contracts for platform-split yt-dlp ownership
- define managed macOS yt-dlp layout and status model

### Phase 2: Runtime Resolution

- add macOS managed yt-dlp path resolution
- add runtime status reporting for that managed path

### Phase 3: Bootstrap / Install

- implement managed Python runtime + yt-dlp package install flow for macOS
- wire bootstrap through runtime gate

### Phase 4: Version Check / Update

- make `check_ytdlp_version` and `update_ytdlp` dispatch by platform
- keep payload shapes unchanged

### Phase 5: Cleanup

- remove bundled macOS standalone from the steady-state execution path
- optionally keep it only for diagnostics during rollout, then remove entirely

## Risks

1. **Spec drift**
   - current backend spec explicitly forbids the new model

2. **Managed Python complexity**
   - bootstrap/install/update flow is more complex than binary replacement

3. **Support burden during migration**
   - mixed macOS states could exist temporarily:
     - old bundled binary
     - partially installed managed runtime
     - fully migrated managed runtime

4. **Release / packaging changes**
   - macOS builds may need different runtime assets or bootstrap hooks

## Mitigations

- keep Windows fully unchanged
- preserve command names and renderer payload shapes
- add explicit runtime-source logging
- use a staged rollout path instead of replacing everything at once
- make managed-runtime health/status visible in support logs

## Validation Plan

### Functional

- macOS fresh install can bootstrap yt-dlp and download YouTube successfully
- `yt-dlp --version` on the managed path is fast
- Settings still show local/latest version and update availability
- `update_ytdlp` still updates successfully on macOS
- Windows behavior remains unchanged

### Performance

- macOS `yt-dlp --version` warm startup should be sub-second
- first extractor activity for injected YouTube should no longer spend tens of seconds before first output

### Regression

- Windows updater still replaces bundled binary
- support-log export identifies runtime source correctly
- runtime gate UI remains coherent when yt-dlp is missing on macOS

## Open Questions

1. Should macOS managed Python be fully app-owned from the first implementation, or do we want a temporary system-Python bridge for faster delivery?
2. Should bundled macOS standalone remain as a hidden fallback during rollout, or should we fail fast if managed yt-dlp is missing?
3. Should `gallery-dl` eventually follow the same macOS platform-split model, or remain bundled for now?
