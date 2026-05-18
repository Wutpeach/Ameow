# brainstorm: portable runtime bootstrap and first-launch sidecar hydration

## Goal

Shrink the Windows portable artifact by removing bundled runtime binaries where feasible, then replace that packaging assumption with a real first-launch runtime bootstrap flow that can detect missing dependencies, force-install the managed runtime where required, download and verify it, and resume affected work. The completed first slice established managed first-launch hydration for `pinterest-dl`; the remaining work in this task series is to apply the same direction serially to `deno` and then `ffmpeg`, while keeping `yt-dlp` bundled with the app.

## What I already know

* Current portable packaging still copies bundled runtime binaries directly into the ZIP from `scripts/package-portable.ps1`.
* The portable staging step currently includes:
  * `yt-dlp`
  * `deno`
  * `ffmpeg`
* `src-tauri/tauri.conf.json` still bundles runtime resources for `yt-dlp` and `deno`.
* Rust already has:
  * runtime dependency snapshot inspection
  * runtime dependency gate phase state
  * commands for `refresh_runtime_dependency_gate_state`, `get_runtime_dependency_gate_state`, and `set_runtime_dependency_user_decision`
* Frontend already has:
  * Settings runtime gate UI
  * main window runtime gate prompt UI
* Repo inspection confirms the current main-window runtime gate UI is a bottom floating prompt rendered in `src/App.tsx`, while `src/pages/SettingsPage.tsx` renders a summary row fed by the same gate state.
* Managed `pinterest-dl` bootstrap is now implemented end-to-end:
  * first-launch probe can trigger forced hydration
  * manifest fetch / file download / validation / atomic install are wired
  * the runtime resolves from `app_config_dir/runtimes/...` rather than a bundled fallback
* The repo now has sidecar publish documentation and a stable runtime sidecars manifest URL shape for `pinterest-dl`.
* Remote release state appears ready enough for client consumption:
  * `runtime-sidecars-pinterest-dl-v0.1.0-dev`
  * `runtime-sidecars-manifest-latest`
* Frontend runtime gate updates currently arrive through the global Tauri event `runtime-dependency-gate-state`.
* The runtime gate payload exposed to the frontend is currently coarse-grained:
  * `phase`
  * `missingComponents`
  * `lastError`
  * `updatedAtMs`
* The backend bootstrap flow currently runs missing managed runtimes serially in this order:
  * `ffmpeg`
  * `pinterest-dl`
  * `deno`
* Current bootstrap state does not yet expose stable UI fields for:
  * current component label
  * next queued component label
  * per-component progress percent / bytes / stage text

## Assumptions (temporary)

* This task should focus on portable/macOS-style first-launch bootstrap and runtime hydration, not the installer-time prefetch flow.
* `pinterest-dl` is now the completed reference implementation for the managed runtime path because the CI publish path already exists.
* `deno` should be the next runtime moved to the managed bootstrap path.
* `ffmpeg` should follow as a separate slice because its archive/extract install shape differs from single-file runtime binaries.
* `yt-dlp` remains bundled with the app and keeps its current version-check/manual-update behavior; it is not a managed-runtime slice in this task series.
* We should implement serially rather than as one large change, because packaging, backend runtime manager, and UI/task resumption each carry different rollback risks.
* The new main-window runtime indicator should appear only while the main window is expanded; it should not remain visible in the minimized/iconified state.

## Open Questions

* None

## Requirements (evolving)

* Portable packaging must be able to stop bundling the runtime binaries targeted by the new bootstrap flow while continuing to bundle `yt-dlp`.
* First launch must inspect local runtime availability before forced hydration begins.
* Missing runtime dependencies must be represented explicitly in one runtime bootstrap state machine, not by ad hoc per-downloader logic.
* Managed runtime downloads must:
  * resolve a pinned asset source
  * download into an app-owned runtime directory
  * validate checksum/size
  * install via atomic replace
  * surface clear success/failure states
* `pinterest-dl` must be fetchable through the published FlowSelect runtime sidecars manifest.
* Phase 1 establishes `pinterest-dl` as the baseline managed runtime contract for the later slices.
* Hydrated runtime binaries in managed slices should install into an app-owned runtime directory under `app_config_dir/runtimes/...`, not next to the executable.
* Phase 1 removes bundled fallback logic for `pinterest-dl`; the managed copy under `app_config_dir/runtimes/...` becomes the only supported runtime path for that downloader.
* Phase 2 targets `deno` only.
* Phase 3 targets `ffmpeg` only.
* `yt-dlp` remains bundled and continues using the current bundled/manual-update path instead of moving into managed bootstrap.
* The app should still open normally during first-launch hydration; only runtime-specific download paths are gated on managed runtime readiness.
* Runtime-gated work must not disappear:
  * affected task stays queued or paused
  * after runtime becomes ready, task continues automatically or through one explicit retry path
* Managed hydration failure must not make unrelated app features unusable.
* The main-window runtime gate UI should replace the current bottom floating prompt with a compact left-bottom indicator.
* During active runtime bootstrap/configuration, the compact indicator should use a yellow circular progress ring instead of a generic breathing dot, so the user can distinguish in-progress work from blocked states.
* If runtime bootstrap is active but no numeric percentage is available yet, the indicator should use an indeterminate animated yellow progress ring rather than showing a fake numeric percentage or falling back to a plain dot.
* If runtime bootstrap needs manual handling, the compact indicator should switch to a yellow breathing/pulsing dot state instead of a red error state.
* Explicit failure states in the compact indicator should also be represented by the same yellow breathing/pulsing dot, with the hover popover copy explaining that the user can go to Settings to handle the issue.
* The compact indicator should appear only while the main window is expanded.
* The hover popover should visually originate from the left-bottom runtime indicator rather than appearing as a detached tooltip.
* The popover reveal animation should use the left-bottom corner as its transform origin/anchor so the motion reads as an extension of the left-bottom indicator.
* When the pointer moves from the compact indicator onto the popover content, the popover should remain open so the user can stably inspect progress details and the next queued runtime item.
* During active runtime bootstrap/configuration, the yellow circular progress ring should respond to hover only and should not react to click.
* When runtime bootstrap needs manual handling, the yellow breathing dot should support both hover and click.
* Clicking the yellow breathing dot should trigger the existing runtime recheck/retry flow from the main window instead of forcing the user to open Settings first.
* Clicking the yellow breathing dot should use a hybrid feedback model:
  * immediately show a lightweight local click acknowledgement such as a brief press/flash
  * wait for the backend to confirm `checking` or `downloading` before switching the indicator back into the yellow circular progress ring state
* After runtime bootstrap succeeds, the compact indicator should use a brief success-confirmation exit rather than disappearing instantly:
  * the ring may complete/fill or subtly brighten
  * the indicator then fades out after a short dwell instead of staying pinned in a success state
* The compact left-bottom progress ring itself should stay purely graphical; numeric percentage/detail text belongs in the hover popover rather than inside the ring.
* The compact runtime indicator should not be limited to first-launch auto-configuration; it should become the unified main-window runtime gate affordance for later runtime-missing, failure, and retry flows as well.
* Hovering the indicator should reveal a compact popover that shows:
  * which runtime component is currently being configured
  * the current component's progress/status in a standard-density layout:
    * current component name
    * compact progress bar
    * percentage and/or short phase text
  * which component will be configured next, if any
* The compact indicator/popover should reuse the shared runtime gate state model instead of introducing disconnected frontend-only bootstrap state.
* The main-window hover popover should remain informational only and should not include action buttons such as recheck/open-settings.
* Settings should still retain a runtime recovery/recheck entry and explanatory status copy even after the main window gains click-to-retry on the breathing indicator.

## Acceptance Criteria (evolving)

* [ ] Windows portable packaging can be produced without bundling the runtime binaries moved to first-launch bootstrap, while `yt-dlp` remains bundled.
* [ ] First launch checks local runtime presence and starts forced managed `pinterest-dl` hydration.
* [ ] Managed `pinterest-dl` hydration fetches asset metadata from the FlowSelect manifest and installs the sidecar successfully.
* [ ] Managed `deno` hydration becomes the second slice and installs into `app_config_dir/runtimes/...`.
* [ ] Managed `ffmpeg` hydration becomes the third slice and handles archive download/extract/validation/install successfully.
* [ ] Downloaded runtime assets are validated and installed atomically.
* [ ] Runtime gate transitions reflect real download progress/result rather than placeholder phase changes only.
* [ ] A queued task blocked on missing runtime can continue after bootstrap success.
* [ ] Failure states remain recoverable from the main window or Settings.
* [ ] The portable artifact no longer ships bundled `pinterest-dl`, and later slices remove bundled `deno` / `ffmpeg` once their managed paths are live.
* [ ] First-launch managed hydration does not block unrelated app features from opening or operating.
* [ ] `yt-dlp` remains bundled with the app and preserves its current version-check / manual-update behavior.
* [ ] The main window uses a left-bottom compact runtime indicator instead of the current bottom floating runtime prompt.
* [ ] The yellow runtime indicator is shown only when the main window is expanded, not when it is minimized/iconified.
* [ ] Hovering the dot opens a compact popover that shows the current runtime item, progress details, and the next queued runtime item.
* [ ] The hover popover uses the standard-density layout rather than a minimal text-only card or an oversized detailed card.
* [ ] The main-window hover popover is informational only and does not include inline recovery action buttons.
* [ ] The hover popover visually expands from the left-bottom indicator and uses the left-bottom corner as its animation anchor.
* [ ] The hover popover stays open while the pointer moves from the compact indicator onto the popover content.
* [ ] Active runtime configuration uses a yellow circular progress ring, while any manual-handling-required state uses a yellow breathing dot.
* [ ] When active runtime bootstrap has no numeric percentage yet, the indicator shows an indeterminate animated yellow ring instead of a misleading fixed percentage.
* [ ] Explicit runtime bootstrap failure does not switch the main-window indicator to red; instead the hover copy guides the user to Settings for recovery.
* [ ] The yellow circular progress ring does not respond to click while configuration is actively running.
* [ ] The yellow breathing indicator responds to click and triggers the same runtime recheck/retry behavior as the existing main-window/settings recovery flow.
* [ ] Clicking the yellow breathing indicator provides immediate local feedback, but the UI only transitions back to the progress-ring state after backend phase confirmation.
* [ ] After runtime bootstrap succeeds, the compact indicator uses a brief success-confirmation animation/dwell before disappearing.
* [ ] The compact ring itself does not render numeric percentage text; percentage/details are shown only in the hover popover.
* [ ] The compact runtime indicator is reused across first-launch bootstrap and later runtime-missing/failure/retry flows instead of being a first-launch-only UI.
* [ ] Settings still exposes a runtime recovery entry after the compact main-window retry affordance is added.
* [ ] Runtime bootstrap payloads sent to the frontend contain enough structured information to render current item and next item without string-parsing logs.

## Definition of Done (team quality bar)

* Tests added or updated where the repo supports them
* Lint / typecheck / targeted build green
* User-facing runtime/bootstrap behavior documented if behavior changes
* Rollback path identified for runtime asset regressions

## Out of Scope (explicit)

* Windows installer-time bootstrap in the same delivery slice
* Auto-updating every runtime dependency source in one shot if the distribution channel is not yet defined
* Generic runtime marketplace / plugin infrastructure
* Migrating `yt-dlp` into the managed runtime bootstrap path
* User-facing release/upgrade cleanup guidance for old portable folders
* Unrelated downloader behavior or UI redesign outside runtime bootstrap needs

## Technical Notes

* Relevant ownership files:
  * `scripts/package-portable.ps1`
  * `src-tauri/tauri.conf.json`
  * `src-tauri/src/lib.rs`
  * `src/App.tsx`
  * `src/pages/SettingsPage.tsx`
  * `docs/runtime-sidecars/publish-and-rollback.md`
* Packaging facts:
  * portable script still hard-copies runtime binaries into `binaries/`
  * `pinterest-dl` is no longer carried in the portable artifact
  * current app runtime probing already supports bundled/resource/app-dir lookup and some PATH fallback behavior
* Sidecar distribution facts:
  * `pinterest-dl` now has a FlowSelect-owned manifest/release publication path and a working client consumption path
  * `deno` and `ffmpeg` still need their own distribution/install contracts before they can migrate into managed bootstrap
* Runtime install directory decision:
  * managed runtime target location is `app_config_dir/runtimes/...`
  * `pinterest-dl` already resolves from the app-owned managed binary path
  * `deno` should reuse this model next, while `ffmpeg` follows with archive extraction specifics
* Runtime ownership decision:
  * `yt-dlp` remains bundled with the app and keeps the current update flow
  * `deno` is the next managed-runtime slice
  * `ffmpeg` follows as the third managed-runtime slice
* UI ownership notes from repo inspection:
  * `src/App.tsx`
    * owns the main-window runtime indicator/prompt
    * loads gate state via `get_runtime_dependency_gate_state` / `refresh_runtime_dependency_gate_state`
    * listens to `runtime-dependency-gate-state`
  * `src/pages/SettingsPage.tsx`
    * shows a runtime summary row based on the same event/state
  * `src/types/runtimeDependencies.ts`
    * mirrors only the coarse gate payload fields today
* Backend ownership notes from repo inspection:
  * `src-tauri/src/lib.rs`
    * emits `runtime-dependency-gate-state`
    * currently reports only gate phase + missing component list + last error
    * can infer current/next component internally because bootstrap is serial, but does not yet emit those details as stable UI payload fields
* Existing retry/recheck behavior from repo inspection:
  * `src/App.tsx`
    * `handleRuntimeDependencyRecheck()` calls `refreshRuntimeDependencyContext({ showHint: true })`
  * `src/pages/SettingsPage.tsx`
    * `handleRuntimeDependencyRecheck()` refreshes runtime status + gate state and shows a hint
  * `src-tauri/src/lib.rs`
    * `refresh_runtime_dependency_gate_state()` can transition missing managed runtimes back into `downloading`, so the breathing-dot click can likely reuse this path instead of introducing a second retry contract

## Decision (ADR-lite)

**Context**: The broader packaged-app-size direction included both installer-time and first-launch runtime hydration, but shipping both together would widen the blast radius across packaging, backend bootstrap, and UX recovery logic.

**Decision**: This task series stays scoped to portable/macOS-style first-launch runtime bootstrap only and is delivered in three slices: completed `pinterest-dl`, then `deno`, then `ffmpeg`. `yt-dlp` remains bundled with the app.

**Consequences**:

* The implementation can focus on one recovery model: local probe -> force hydrate -> install -> resume.
* Windows installer-time prefetch remains a follow-up task and will not block the first portable bootstrap delivery.
* The completed first slice already proves the managed bootstrap path with `pinterest-dl`.
* `deno` and `ffmpeg` now become the only remaining managed-runtime slices in this task series.
* Bundled fallback logic for `pinterest-dl` is removed instead of being kept as a rollout guard.
* `yt-dlp` keeps its existing bundled/runtime-update model, reducing scope and avoiding churn in the main downloader path.
* User-facing first-launch behavior remains deterministic for managed slices: probe -> hydrate -> install -> retry gated work, while the rest of the app stays usable.

## Implementation Plan (serial)

* Phase 1: `pinterest-dl` managed bootstrap baseline (completed)
  * define managed runtime install directory and manifest/asset schema consumption contract
  * prove local probe -> force hydrate -> install -> retry for one managed runtime
* Phase 2: `deno` managed runtime bootstrap
  * define a pinned distribution source and validation contract for `deno`
  * generalize the runtime downloader/install pipeline beyond the `pinterest-dl`-specific path
  * gate `deno`-dependent work and support retry/continue after runtime becomes ready
  * remove bundled `deno` from the portable package and Tauri resources
* Phase 3: `ffmpeg` managed runtime bootstrap
  * define the archive download/extract/install contract for `ffmpeg`
  * install the required runtime binaries into `app_config_dir/runtimes/...` with validation and atomic replacement where applicable
  * gate `ffmpeg`-dependent work and support retry/continue after runtime becomes ready
  * remove bundled `ffmpeg` from the portable package
* Ongoing constraints across slices
  * keep `yt-dlp` bundled and leave its current version-check/manual-update flow unchanged
  * keep main window and Settings recovery paths working for managed runtimes
