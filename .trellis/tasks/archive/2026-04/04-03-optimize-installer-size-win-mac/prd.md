# Brainstorm: optimize installer size on win and mac

## Goal

Understand why the Windows and macOS installers are currently hundreds of megabytes, identify the largest contributors with repo-backed evidence, and converge on a packaging strategy that meaningfully reduces installer size without breaking runtime reliability.

## What I already know

* The user reports that both Windows and macOS installers feel unusually large, in the "hundreds of MB" range.
* The app uses Electron Builder, not Tauri. Packaging entrypoints are defined in [`package.json`](/Users/mabel/Documents/FlowSelect/package.json) and [`electron-builder.config.mjs`](/Users/mabel/Documents/FlowSelect/electron-builder.config.mjs).
* Current builder config sets `asar: false` and includes broad file globs:
  * `dist/**/*`
  * `dist-electron/**/*`
  * `locales/**/*`
  * `desktop-assets/binaries/**/*`
* Current mac artifact sizes in the local workspace:
  * `dist/assets`: 576 KB JS + 8 KB CSS
  * `dist`: 596 KB
  * `dist-electron`: 452 KB
  * `desktop-assets`: 99 MB
  * `dist-release/mac-arm64/FlowSelect.app`: 439 MB
  * `dist-release/dmg/FlowSelect_0.2.9_macos_arm64_installer.dmg`: 242 MB
* Current packaged mac app size breakdown:
  * `Contents/Frameworks`: 268 MB
  * `Contents/Resources/app`: 171 MB
  * `Contents/Resources/app/desktop-assets`: 100 MB
  * `Contents/Resources/app/node_modules`: 70 MB
* Packaged mac app currently includes both mac and Windows downloader binaries:
  * `yt-dlp-aarch64-apple-darwin`: 35 MB
  * `gallery-dl-aarch64-apple-darwin`: 23 MB
  * `gallery-dl-x86_64-pc-windows-msvc.exe`: 24 MB
  * `yt-dlp-x86_64-pc-windows-msvc.exe`: 18 MB
* Runtime path resolution is already platform-specific in [`src/electron-runtime/runtimePaths.ts`](/Users/mabel/Documents/FlowSelect/src/electron-runtime/runtimePaths.ts), so cross-platform downloader binaries do not need to be shipped inside the same target package.
* Packaged app `node_modules` contains large renderer-oriented packages that are likely not needed as loose runtime dependencies in the installer:
  * `lucide-react`: 37 MB
  * `react-dom`: 7.7 MB
  * `zod`: 5.9 MB
  * `framer-motion`: 5.7 MB
  * `motion-dom`: 4.2 MB
  * `react-router`: 3.6 MB
* `lucide-react` package size is inflated by shipped source maps inside the packaged app.
* The codebase explicitly filters out `app.asar` locale paths in [`electron/main.mts`](/Users/mabel/Documents/FlowSelect/electron/main.mts), so switching to `asar: true` is possible but not a zero-risk toggle.

## Assumptions (temporary)

* The main user value is to reduce installer/download size first, not merely the uncompressed app bundle size on disk.
* Keeping startup reliable on fresh installs matters more than chasing the smallest possible binary immediately.
* The highest-confidence first phase is packaging hygiene: reduce redundant assets and dependency bloat before changing runtime behavior.

## Open Questions

* None for the current MVP.

## Requirements (evolving)

* Quantify the main installer size drivers for both platforms.
* Identify which packaged contents are essential versus redundant.
* Remove `lucide-react` and replace the few remaining usages with project-local inline SVG icon components.
* Ship only downloader binaries for the current target platform/arch.
* Move renderer libraries already bundled into `dist/` out of runtime production dependencies.
* Exclude `.map`, `src`, README/docs, and similar non-runtime dependency payload from packaged app contents where safe.
* Preserve cross-platform runtime behavior and packaged app reliability.

## Acceptance Criteria (evolving)

* [ ] Root causes of installer size are documented with measured evidence from the repo/build output.
* [ ] At least 2 feasible optimization approaches are documented with expected gains, risks, and implementation implications.
* [ ] A recommended MVP reduction path is identified.
* [ ] Explicit out-of-scope items and higher-risk follow-ups are called out.

## Definition of Done (team quality bar)

* Tests added/updated where packaging behavior changes
* Lint / typecheck / CI green
* Docs/notes updated if packaging behavior changes
* Rollout/rollback considered if runtime bootstrap behavior changes

## Out of Scope (explicit)

* Replacing Electron with another desktop runtime
* Redesigning download/runtime architecture end-to-end in this brainstorm
* Shipping a new packaging implementation before scope is agreed

## Research Notes

### What similar Electron packaging guidance suggests

* Electron apps have a substantial fixed baseline because Chromium/Electron frameworks are bundled into every desktop app.
* Electron Builder supports narrowing packaged files and moving only selected runtime assets into the final app bundle.
* `asar` can help packaging structure, but executables and assets that must stay directly addressable often need to remain outside the archive or be explicitly unpacked.
* A common way to shrink installers is to avoid bundling large optional runtimes inside the app and instead fetch/manage them on first launch or first use.

### Constraints from this repo/project

* Runtime downloaders are currently prepared at build time via `npm run runtime:ensure:downloaders`.
* Builder currently includes the entire `desktop-assets/binaries/**/*` tree for every target.
* Runtime resolution is already target-aware, which makes per-platform packaging practical.
* The renderer build is already tiny, so frontend bundle optimization is not the main lever here.
* The project currently relies on loose packaged resources in some paths, so `asar` work requires an audit rather than a blind toggle.

### Feasible approaches here

**Approach A: package hygiene only** (Recommended MVP)

* How it works:
  * Ship only downloader binaries for the current target platform/arch.
  * Move renderer-bundled libraries out of `dependencies` when they are not needed by Electron main/preload runtime.
  * Exclude unneeded package payload such as dependency source maps, `src/`, docs, and tests from packaged app contents where safe.
* Pros:
  * High confidence, immediate savings.
  * No user-visible behavior change.
  * Lowest regression risk.
* Cons:
  * Installer still carries the Electron baseline.
  * Probably yields "meaningfully smaller" rather than "dramatically small".

**Approach B: managed heavy runtimes on first launch / first use**

* How it works:
  * Stop bundling `yt-dlp` and `gallery-dl` into installers.
  * Download and cache them into the existing managed runtime location after install or when the user first hits a feature that needs them.
* Pros:
  * Largest single size reduction available from current evidence.
  * Works for both Windows and macOS.
  * Aligns with the existing managed-runtime pattern already used for other tools.
* Cons:
  * Users lose fully offline-ready downloader capability on a fresh install.
  * Adds first-run UX, retry, and failure-state work.
  * Needs clearer status and recovery flows.

**Approach C: packaging refactor with `asar` and tighter app layout**

* How it works:
  * Audit packaged-path assumptions, enable `asar`, and explicitly unpack only binaries or resources that must remain outside the archive.
  * Potentially split app code/resources from executable assets more aggressively.
* Pros:
  * Can further reduce packaged clutter and improve packaging discipline.
  * Creates a cleaner long-term structure.
* Cons:
  * Highest complexity and regression risk.
  * Requires path audit across locales, executable resources, and any direct file access.
  * Not the fastest path to first measurable wins.

## Expansion Sweep

### Future evolution

* If more managed runtimes are added later, per-platform and on-demand packaging becomes more important, not less.
* If auto-update becomes a first-class flow, smaller installer/update payloads become more valuable for release velocity and bandwidth costs.

### Related scenarios

* Windows installer, macOS DMG, and portable packaging should follow the same runtime-bundling policy to avoid drift.
* Browser extension packaging is separate and should stay out of the desktop installer size discussion unless intentionally bundled later.

### Failure & edge cases

* First-use runtime downloads need network failure, retry, checksum, and cancellation behavior.
* Any `asar` change must preserve packaged path resolution for locales and executable sidecars.

## Technical Approach

Start with a measurement-driven MVP:

1. Reduce redundant packaged payload first:
   * package only current-target downloader binaries
   * trim renderer-only libraries from packaged production dependencies
   * exclude dependency maps/source/docs where safe
2. Re-measure Windows and macOS artifacts.
3. Decide whether the remaining size is acceptable.
4. If not, move downloader binaries to managed first-run/on-demand installation.

## Decision (ADR-lite)

**Context**: Current installers are large mainly because they bundle the Electron runtime, all target downloader binaries, and a broad set of loose production dependencies.

**Decision**: Implement Approach A as the current MVP:
- keep offline-bundled downloader binaries, but only for the current target platform
- remove `lucide-react`
- move renderer-only libraries out of runtime dependencies
- exclude non-runtime dependency payload from packaged output

**Consequences**:
* This should produce a meaningful size reduction without changing first-launch runtime behavior.
* Cross-platform downloader packaging must stay aligned with runtime target resolution logic.
* `asar` remains a later optimization after packaged path assumptions are audited.

## Technical Notes

* Inspected files:
  * [`package.json`](/Users/mabel/Documents/FlowSelect/package.json)
  * [`electron-builder.config.mjs`](/Users/mabel/Documents/FlowSelect/electron-builder.config.mjs)
  * [`scripts/downloader-binaries.mjs`](/Users/mabel/Documents/FlowSelect/scripts/downloader-binaries.mjs)
  * [`scripts/ensure-downloader-binaries.mjs`](/Users/mabel/Documents/FlowSelect/scripts/ensure-downloader-binaries.mjs)
  * [`src/electron-runtime/runtimePaths.ts`](/Users/mabel/Documents/FlowSelect/src/electron-runtime/runtimePaths.ts)
  * [`src/electron-runtime/platform.ts`](/Users/mabel/Documents/FlowSelect/src/electron-runtime/platform.ts)
  * [`electron/main.mts`](/Users/mabel/Documents/FlowSelect/electron/main.mts)
* Local measurements were taken from the current workspace on 2026-04-03.
* Relevant official docs checked:
  * Electron Builder contents/config documentation
  * Electron ASAR documentation
