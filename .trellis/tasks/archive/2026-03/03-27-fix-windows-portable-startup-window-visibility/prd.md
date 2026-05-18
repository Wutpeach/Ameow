# Fix Windows Portable Startup Window Visibility

## Goal

Ensure the latest Windows portable package reliably shows a visible main window on first launch, instead of only exposing a tray icon with no discoverable UI, while eliminating stale-artifact verification mistakes from the debugging flow. The final shipped portable UI must also match the development build closely enough that the main floating window, settings window, and hover controls are visually and behaviorally consistent with `npm run dev`.

## What I Already Know

* The current desktop runtime is Electron, not Tauri, so the fix must target Electron `BrowserWindow` behavior rather than Tauri/WebView2 installer settings.
* The current known-good source baseline for local development is commit `d1c0a5b`; `npm run dev` was re-verified from that baseline and the development UI starts normally.
* The current packaged-window risk profile in `electron/main.mts` is high on Windows:
  * main window is `transparent: true`
  * `frame: false`
  * `alwaysOnTop: true`
  * `skipTaskbar: true` on Windows
  * the main window is shown through tray-first runtime flow
* The current renderer baseline in `src/App.tsx` starts with compact/iconified behavior by default:
  * `isMinimized = true`
  * startup animation exits initial mount quickly
  * idle timer can auto-minimize shortly after launch
* That means packaged Windows can fail in two layers at once:
  * native window reveal/visibility
  * renderer first-frame compact state
* The currently available `startup-diagnostics-latest.txt` evidence is from development mode, not packaged mode:
  * `isPackaged: false`
  * `execPath` points to local Electron dev runtime
  * so it cannot be treated as direct proof of the portable-package failure mode
* The repository already has a historical brainstorm task for Windows portable rendering issues. Its Tauri/WebView2-specific conclusions are now partially outdated, but its core insight remains relevant:
  * transparent compact windows are more sensitive to Windows compositor/GPU/startup timing differences
* There is a separate but critical packaging/debugging hazard:
  * older `scripts/package-portable.ps1` behavior allowed the ZIP artifact to update while `dist-release/portable/FlowSelect_portable/` remained stale if the directory was in use
  * this made it easy to test an old unpacked portable directory and misattribute results to the latest code
* Current debugging must treat stale-artifact prevention as part of the task, not just a side note.

## Assumptions (Temporary)

* The primary product bug is packaged-Windows startup visibility in Electron, not a development-mode problem.
* The most likely functional cause is the combination of:
  * transparent frameless always-on-top small window startup
  * tray-first behavior with `skipTaskbar: true`
  * renderer-side compact startup state
* Path/asset packaging mistakes are lower probability than visibility/reveal timing, because the current Electron builder config already includes `dist/**/*` and `dist-electron/**/*` and uses `asar: false`.
* Artifact freshness and window visibility are distinct problems, but both must be addressed before any packaged manual verification can be trusted.

## Requirements

* Use the repository portable packaging entrypoint and make sure validation targets a fresh artifact, not a possibly stale mirror directory.
* Prevent false-positive debugging caused by stale unpacked portable artifacts.
* Fix packaged Windows startup so the main window becomes visibly discoverable on first launch even when tray initialization succeeds.
* Preserve intentional close-to-hide and tray re-show behavior after startup.
* Preserve current Windows taskbar/tray behavior unless a narrowly scoped diagnostic exception is explicitly chosen.
* Keep development-mode behavior stable unless shared logic requires a minimal coordinated change.
* Prefer the smallest packaged-Windows-specific fix that restores first-launch visibility before considering broader UI/runtime redesign.
* Include a short-lived packaged-only diagnostic escape hatch for field validation:
  * enough to capture packaged startup evidence on affected machines
  * scoped so it does not become an always-on production behavior by accident
* Restore packaged-Windows UI parity with development:
  * main floating window should match development styling, chrome controls, hover states, and layout
  * settings window should open reliably and match development styling/behavior
  * packaged-only fallbacks must not leave the app looking like a different product surface

## Acceptance Criteria

* [ ] A freshly built Windows portable ZIP, extracted into a new directory, shows a visible main window on first launch on the affected test machine.
* [ ] The app no longer reaches the failure state where only the tray icon is available and the main UI is effectively undiscoverable.
* [ ] The packaged portable main window matches the development build closely enough that a human tester would not describe it as a different UI.
* [ ] The packaged portable main window shows the same close/settings hover controls and interactions as development.
* [ ] The packaged settings window opens reliably and matches the development build in appearance and behavior.
* [ ] Tray integration still works after the fix:
  * tray icon is present
  * tray click or tray menu can re-show the main window
* [ ] Intentional hide/minimize-to-tray behavior still works after initial startup.
* [ ] The packaging/debugging flow no longer allows a stale `FlowSelect_portable` mirror directory to silently stand in for the latest build during validation.
* [ ] A packaged-only diagnostic path exists for short-term troubleshooting and can surface startup evidence on affected machines without requiring source edits on every test pass.
* [ ] `npm run lint` and `npm run type-check` pass for the final change set.
* [ ] Manual packaged-Windows verification steps are recorded clearly enough that future sessions can reproduce the check without reintroducing stale-artifact confusion.

## Definition of Done

* Targeted source changes are implemented with packaged-Windows scope kept explicit.
* Relevant tests are added or updated where practical for startup-state and packaging-guard logic.
* Lint and typecheck pass.
* Manual packaged Windows verification is completed against a fresh ZIP extraction and confirms UI parity with development for the main floating window and settings window.
* Any new diagnostic behavior is either intentionally kept as part of the contract or explicitly removed before task completion.

## Technical Approach

Recommended MVP direction:

* Packaging guard first:
  * make portable packaging fail loudly if the portable mirror directory cannot be refreshed to the same build content as staging
  * keep manual verification anchored to a fresh ZIP extraction path
* Packaged Windows startup fix second:
  * move the main window to a bounded reveal flow rather than immediate visible startup
  * make the packaged Windows first launch visibly discoverable before compact-mode logic is allowed to take over
  * use packaged-Windows-specific fallback behavior only where needed
* Renderer coordination:
  * ensure packaged Windows does not start in a misleading compact/iconified state
  * ensure initial idle auto-minimize does not immediately undo the native reveal
* Temporary diagnostics:
  * add a packaged-only debug escape hatch that can be intentionally enabled during verification
  * prefer diagnostics that confirm packaged startup state and reveal path without permanently changing normal production UX

### Revised Direction After Expert Review

The next implementation pass should **not** rebuild the FlowSelect UI from scratch in an "Electron style". The current React design system remains the source of truth for both development and packaged builds.

Instead, treat the remaining bug as an **Electron window-shell parity problem**, not a design-system replacement problem:

* Keep the existing frontend design system and component recipes as canonical:
  * `.trellis/spec/frontend/design-system.md`
  * `src/contexts/ThemeContext.tsx`
  * `src/components/ui/shared-styles.ts`
* Rework the Electron-specific window shell layer so packaged Windows renders the same React UI under the same visual assumptions as development.
* Final packaged behavior should converge back toward the original transparent floating-window design rather than shipping an opaque fallback that makes the product look different.

What has now been validated after implementation and outside expert input review:

* A **shared BrowserWindow creation / reveal factory** is the right architectural direction.
* A **double-gated reveal flow** is also correct:
  * `show: false`
  * wait for initial load readiness
  * wait for a renderer-ready handshake close to first interactive paint
  * then reveal
* Packaged-only diagnostics and fresh-artifact verification remain part of the task contract.

What should **not** be adopted blindly:

* Do **not** assume every packaged Windows surface must use the exact same transparency policy right now.
* Do **not** revert `settings` back onto the transparent packaged path just to satisfy symmetry while the main transparent path is still unstable.
* Do **not** treat `type: "panel"` or other Electron window hints as the first or only fix before testing narrower compositor-contract changes.
* Do **not** rewrite packaged file loading around unrelated example paths such as `resources/app.asar/dist/index.html`; keep the repo's existing packaging / route construction intact.

Concrete direction for the next pass:

* Window factory:
  * keep the shared BrowserWindow creation and reveal contract for `main` and secondary windows
  * allow **per-window packaged transparency policy** while debugging, instead of forcing full symmetry too early
* Reveal strategy:
  * keep `show: false`
  * keep readiness + renderer-ready gating
  * keep the bounded reveal delay only as a small additive hedge, not as the primary fix
* Main packaged transparent experiment:
  * test the packaged transparent main path with a **true zero-alpha background** (`#00000000`) instead of the current near-transparent themed fallback
  * after `show()` / `focus()`, reinforce z-order on Windows with `setAlwaysOnTop(true, "screen-saver")`
  * if needed, re-apply that z-order reinforcement on `focus`
* Settings packaged strategy:
  * keep the packaged-Windows `settings` opaque fallback in place during the next debugging pass
  * treat it as a temporary stabilization aid, not proof that the final shipped settings window must stay opaque forever
* Hover / hit-test parity:
  * verify `no-drag` vs drag-region behavior for main-window controls
  * ensure hover controls are not dependent on packaged-only timing gaps that leave them permanently hidden
  * treat missing close/settings hover controls as a packaged parity regression, not as optional polish

This means the recovery path is now:

1. keep the existing design system
2. keep the shared Electron window lifecycle
3. narrow the next experiment to compositor-contract deltas on the transparent `main` path
4. avoid expanding the transparent parity goal to `settings` again until the main path is stable

Do **not** close the task by introducing a visually different packaged-only shell unless it is used purely as a temporary diagnostic step.

## Decision (Proposed ADR-lite)

**Context**: The symptom combines real packaged-Windows visibility risk with a separate stale-artifact debugging trap. Prior attempts mixed both concerns, which increased the chance of validating the wrong build.

**Proposed Decision**: Deliver the fix as one scoped MVP with two concrete slices inside the same task:

1. artifact freshness guard for portable verification
2. packaged-Windows main-window startup visibility stabilization
3. packaged-only short-term diagnostic escape hatch for field validation

After initial visibility stabilization, the task now expands into a second required slice before completion:

4. packaged-Windows UI parity restoration using the existing FlowSelect design system and an Electron-native window-shell implementation

Do not expand the MVP into broader runtime distribution changes, installer work, or general floating-window redesign.

**Consequences**:

* Pros:
  * lowers the chance of chasing the wrong build again
  * keeps the fix close to the actual failure path
  * avoids overfitting to outdated Tauri/WebView2 assumptions
  * gives one controlled way to gather better packaged evidence if the first fix is still insufficient
* Cons:
  * manual packaged validation is still required
  * some Windows compositor/GPU edge cases may still require a follow-up fallback if the minimal fix is insufficient
  * the diagnostic hook must be explicitly scoped so it does not linger as accidental default behavior

## Out of Scope

* Replacing the FlowSelect floating-window visual language in general.
* Switching the project back to Tauri-native runtime behavior.
* Broad WebView2 distribution strategy changes or installer-runtime policy changes.
* Unrelated tray/taskbar/icon polish outside what is needed to preserve startup behavior.
* A full cross-platform windowing redesign for macOS/Linux.
* Keeping the diagnostic escape hatch as a permanently user-facing feature unless that is later promoted in a separate task.

## Technical Notes

Primary files likely involved:

* `electron/main.mts`
  * owns main window creation, tray bootstrap, show/focus, and close-to-hide behavior
* `src/App.tsx`
  * owns initial minimized state, startup animation, compact-mode transitions, and idle auto-minimize behavior
* `scripts/package-portable.ps1`
  * owns `win-unpacked` -> staging -> ZIP -> `FlowSelect_portable` mirror flow
* Potential supporting files if the implementation warrants them:
  * `electron/windowVisibility.mts`
  * `electron/windowVisibility.test.mts`
  * `src/utils/startupWindowState.ts`
  * `src/utils/startupWindowState.test.ts`

Relevant repository constraints:

* Electron builder output is under `dist-release/`.
* Windows portable packaging is a manual ZIP flow layered on top of `npm run package:win:dir`.
* Builder config includes renderer and Electron outputs and currently uses `asar: false`.
* The debugging process must distinguish:
  * source at `HEAD`
  * current `dist-electron/` dev artifacts
  * `dist-release/win-unpacked/` packaged app
  * `dist-release/portable/FlowSelect_portable/` unpacked mirror
  * `dist-release/portable/*.zip` actual portable artifact

## Research Notes

### What Similar Packaged Floating-Window Bugs Usually Come From

* Packaged Windows frameless transparent utility windows are more fragile than normal framed windows.
* Immediate show/focus at construction time is more error-prone than reveal-after-ready logic.
* Tray-first apps with `skipTaskbar: true` amplify discoverability failures because there is no taskbar fallback when the first reveal fails.

### Constraints From This Repo

* We already have direct evidence that stale artifacts can poison debugging unless packaging validation is strict.
* The current main window is intentionally very small and visually compact, so a failed or misleading first frame is easy for users to interpret as “no window”.
* Development mode is already known-good, so the fix should focus on packaged-Windows behavior rather than broad runtime churn.

### Feasible Approaches Here

**Approach A: Minimal packaged-Windows visibility stabilization** (Recommended)

* How it works:
  * add packaged-Windows reveal gating and renderer startup-state coordination
  * keep tray-first behavior intact
  * harden packaging verification against stale mirrors
* Pros:
  * smallest targeted change
  * directly addresses both the real bug and the recurring debugging mistake
* Cons:
  * may still need a second fallback if some Windows compositor combinations remain problematic

**Approach B: Packaged-Windows opaque fallback by default**

* How it works:
  * for packaged Windows, prefer a non-transparent or opaque-background startup shell
  * keep dev behavior unchanged
* Pros:
  * higher confidence for visibility
* Cons:
  * bigger product-behavior change
  * may affect the intended floating aesthetic

**Approach C: Diagnostic-heavy first pass**

* How it works:
  * add packaged startup diagnostics/devtools hooks first, collect more machine evidence, then fix
* Pros:
  * strongest evidence trail
* Cons:
  * slower to user-visible resolution
  * risks spending another iteration collecting logs instead of removing the obvious startup hazards

## Manual Verification Notes

### Fresh portable artifact flow

1. Run `npm run package:portable`.
2. If the script cannot refresh `dist-release/portable/FlowSelect_portable/`, treat the build as failed and close any running portable instance before retrying.
3. Read `dist-release/portable/portable-verification.json` and use its `verificationPath` value as the canonical fresh extraction to test.
4. Do not validate against a previously unpacked directory outside the current `verificationPath`, even if a similarly named `FlowSelect_portable` directory already exists.

### Packaged startup diagnostics

1. From the fresh extraction directory, launch `FlowSelect.exe --flowselect-startup-diagnostics`.
2. This enables packaged-Windows-only startup diagnostics without changing normal production startup behavior.
3. Inspect `startup-diagnostics-latest.txt` under the app `logs` directory in Electron `userData` after reproducing the launch.
4. The diagnostic log should confirm whether the run is packaged, which reveal bounds were chosen, and whether the main window reached `ready-to-show` and `show`.
5. As of the latest 2026-03-28 verification / regression cycle:
   * packaged Windows `main` can still reach `show` / `focus` while remaining invisible to the human tester when `transparentWindow: true`
   * a prior packaged `settings` opaque experiment was useful for fault isolation, but later refactoring that removed the packaged `settings` opaque fallback caused `settings` to become invisible again on the affected machine
   * the packaged `settings` opaque fallback has now been restored in code as a temporary stabilization measure and must be re-validated before treating `settings` as stable again
6. Keep the product chrome contract explicit during verification:
   * FlowSelect should continue using its custom in-app title/header controls
   * do not treat a fallback to native Windows titlebar chrome as an acceptable final fix for `settings`

## Current Progress

### Completed

* Portable packaging now guards against stale mirror-directory validation and writes `portable-verification.json` plus a fresh extraction path for testing.
* Packaged Windows main-window startup no longer fails into a tray-only invisible state on the latest verified portable build.
* Packaged-only startup diagnostics can now capture packaged launch evidence from a fresh extraction.
* The team has now aligned on a product direction: preserve the existing design system and fix Electron window-shell behavior instead of re-creating the UI in a different packaged-only style.
* A shared BrowserWindow creation / reveal contract is now implemented:
  * shared creation helper
  * `show: false`
  * readiness wait
  * renderer-ready handshake
  * bounded reveal flow
* Packaged Windows renderer startup has been coordinated with the reveal path:
  * main window starts expanded
  * initial auto-minimize is delayed long enough to avoid immediately undoing first reveal
* The packaged-Windows investigation has now been split successfully:
  * `settings` no longer has to stay on the same transparent-window path as `main` during debugging
  * the remaining "completely invisible despite show/focus" failure is currently isolated to the transparent main floating window path
* The recent regression where `settings` disappeared again after a transparency-unification refactor has been understood:
  * the packaged-Windows opaque `settings` fallback was removed too early
  * that fallback has now been restored in code so the next pass can stay focused on the transparent `main` path

### Remaining Gaps

* Packaged Windows UI parity is not done yet.
* The latest portable build still differs visually from development enough that it is not acceptable as a final fix.
* The main floating window hover controls are still regressed in packaged validation.
* The main floating window can still remain fully invisible on packaged Windows even after `show`, `focus`, and bounded reveal delay complete in diagnostics.
* `settings` should currently be treated as **temporarily stabilized for debugging**, not as finally fixed:
  * the opaque packaged fallback is restored
  * it still needs fresh packaged verification
  * it is not yet the intended final visual contract
* We still do not know whether the final shipped packaged-Windows `settings` path should be transparent or opaque at the host-window level; that decision should wait until the transparent `main` path is stable.
* The next targeted packaged-transparent `main` experiment has not been run yet:
  * exact `#00000000` background
  * stronger post-show Windows always-on-top reinforcement (`screen-saver`)
  * optional focus-time always-on-top reapply

### Current Task Boundary

* Do not close this task on visibility alone.
* The task remains in implementation until packaged Windows matches the development UI for all affected desktop windows and controls.
* The preferred path forward is:
  * one shared Electron window lifecycle
  * no packaged-only visual redesign
  * but **not** a premature requirement that every window use identical packaged transparency settings during debugging
* The next pass should stay tightly focused on the transparent `main` compositor path before re-expanding transparency goals to `settings`.
* Do not resolve packaged `settings` by introducing a native Windows titlebar as the shipped behavior; the product contract remains FlowSelect-owned chrome and integrated styling.
