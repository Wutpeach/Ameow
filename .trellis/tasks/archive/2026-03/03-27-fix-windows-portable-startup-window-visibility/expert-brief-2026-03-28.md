# Expert Brief: FlowSelect Packaged Windows Portable Window Visibility

Date: March 28, 2026

## 1. Request

We need expert guidance on how to make a packaged Windows Electron portable build reliably show and render our compact floating UI on first launch, while preserving our intended product behavior and visual design.

This is not a generic Electron question. The failure happens in a very specific product shape:

- tiny utility window
- frameless
- transparent main surface
- always-on-top
- tray-first behavior
- `skipTaskbar: true`
- custom React-rendered chrome and hover controls
- packaged Windows portable distribution

We have already narrowed the problem significantly. We are no longer asking "why is Electron broken?" We are asking what the right final packaged-Windows window-shell strategy should be for this product.

## 2. Product Context

FlowSelect is a desktop collector/downloader utility.

Current runtime:

- Electron 41
- React 19 renderer
- Vite build
- Windows portable package built via `electron-builder --dir` plus a repo-local ZIP packaging step

Primary desktop surfaces:

- `main`
  - compact floating utility window
  - intended size `200x200`
  - frameless
  - usually transparent
  - always on top
  - close hides to tray instead of quitting
- `settings`
  - custom FlowSelect-owned chrome, not native OS chrome
  - opens adjacent to the main window when possible
- `context-menu`
  - compact secondary surface

Behavior expectations:

- tray icon present
- first launch should show a discoverable main window
- tray click can re-show the window
- settings should remain visually aligned with the development build
- packaged Windows should not look like a different product shell

## 3. What "Good" Looks Like

Our desired final result is:

- packaged Windows portable build shows a visible main window on first launch
- main window remains visually close to the development build
- close/settings hover controls render and behave normally
- settings opens reliably and renders full React content
- tray-first behavior remains intact
- we do not solve the problem by permanently shipping native Windows titlebar chrome or a visibly different packaged-only UI

## 4. Current Known-Good and Known-Bad States

### Known Good

- Development build (`npm run dev`) is good.
- The stale-artifact debugging trap has been fixed.
- We now generate a fresh verification extraction path for every portable build.
- We now have packaged-only startup diagnostics.
- We have isolated the hardest remaining issue to the packaged transparent main-window path.

### Known Bad

- Packaged Windows can still report `show` / `focus` for the transparent `main` window while the human tester still sees no window.
- Packaged Windows `settings` has been unstable when moved between transparent and opaque experimental paths.
- UI parity with development is not yet restored.

## 5. Why This Task Became Difficult

Two separate problems were mixed together earlier:

1. real packaged-Windows visibility/rendering problems
2. stale unpacked portable artifacts causing false debugging conclusions

We have now separated those.

The artifact-freshness problem is largely under control.
The remaining difficulty is the packaged-Windows Electron window/compositor/render startup contract.

## 6. Current Packaging / Verification Contract

Portable build command:

```powershell
npm run package:portable
```

Current fresh verification metadata:

- ZIP path:
  - `D:\FlowSelect\dist-release\portable\FlowSelect_0.2.9_windows_x64_portable.zip`
- ZIP SHA256:
  - `67BD2683472ECCBBEFA020CCAF4F89CC5D15CD1975A44DF973F5218770FCF532`
- Fresh verification extraction:
  - `D:\FlowSelect\dist-release\portable\verification\FlowSelect_portable_verify_20260328_014713\FlowSelect_portable`

Verification metadata file:

- [portable-verification.json](/D:/FlowSelect/dist-release/portable/portable-verification.json)

Important debugging rule:

- We do not validate against any old unpacked portable directory.
- We only validate against the latest `verificationPath` recorded in `portable-verification.json`.

## 7. Current Window Strategy in Code

Relevant files:

- [electron/main.mts](/D:/FlowSelect/electron/main.mts)
- [electron/windowVisibility.mts](/D:/FlowSelect/electron/windowVisibility.mts)
- [electron/preload.mts](/D:/FlowSelect/electron/preload.mts)
- [src/main.tsx](/D:/FlowSelect/src/main.tsx)
- [src/components/RendererReadySignal.tsx](/D:/FlowSelect/src/components/RendererReadySignal.tsx)
- [src/App.tsx](/D:/FlowSelect/src/App.tsx)
- [src/pages/SettingsPage.tsx](/D:/FlowSelect/src/pages/SettingsPage.tsx)
- [src/utils/startupWindowState.ts](/D:/FlowSelect/src/utils/startupWindowState.ts)
- [scripts/package-portable.ps1](/D:/FlowSelect/scripts/package-portable.ps1)

### Main Window

Current main-window creation and reveal behavior:

- `show: false`
- `frame: false`
- `alwaysOnTop: true`
- `skipTaskbar: true` on Windows
- waits for:
  - initial load readiness
  - renderer-ready IPC signal
  - optional transparent packaged-Windows reveal delay
- then applies bounded reveal positioning and shows/focuses the window

Relevant code:

- [electron/main.mts](/D:/FlowSelect/electron/main.mts#L3250)
- [electron/main.mts](/D:/FlowSelect/electron/main.mts#L3282)

### Secondary Windows

Current secondary-window behavior:

- created through the same helper as `main`
- waits for renderer-ready before reveal
- on packaged Windows, `settings` is currently forced back onto a non-transparent fallback path as a temporary stabilization measure

Relevant code:

- [electron/main.mts](/D:/FlowSelect/electron/main.mts#L3325)
- [electron/main.mts](/D:/FlowSelect/electron/main.mts#L3344)

### Window Visibility Helper

Current helper logic defines:

- packaged Windows startup diagnostics flag
- packaged Windows force-opaque flag
- transparent packaged-Windows reveal delay
- fallback centered reveal bounds for first show / off-screen recovery

Relevant code:

- [electron/windowVisibility.mts](/D:/FlowSelect/electron/windowVisibility.mts)

### Renderer Ready Gate

The renderer now emits a "renderer ready" IPC signal after route-mounted UI has had a chance to paint.

Current signal behavior:

- route-level ready signal instead of root-only signal
- double `requestAnimationFrame`
- timeout fallback

Relevant code:

- [src/main.tsx](/D:/FlowSelect/src/main.tsx#L85)
- [src/components/RendererReadySignal.tsx](/D:/FlowSelect/src/components/RendererReadySignal.tsx)
- [electron/main.mts](/D:/FlowSelect/electron/main.mts#L4006)

### Renderer Startup State

Packaged Windows renderer currently gets:

- start expanded on launch
- 12-second auto-minimize grace period

Relevant code:

- [src/utils/startupWindowState.ts](/D:/FlowSelect/src/utils/startupWindowState.ts)

## 8. Symptoms We Have Directly Observed

### Symptom A: Transparent Main Window Can Be "Shown" But Still Not Human-Visible

Packaged Windows diagnostics have shown cases where:

- Electron reports `show`
- Electron reports `focus`
- reveal bounds look valid
- yet the human tester still does not see the transparent main window

This is the highest-priority remaining issue.

### Symptom B: Settings Can Regress Between "Visible Shell" and "Invisible"

During experiments:

- forcing `settings` off the transparent path made it possible to surface a visible shell
- but at one point that shell appeared as solid-color background with missing renderer content
- after a later unification pass, removing the packaged-Windows opaque `settings` fallback caused `settings` to become invisible again on the test machine
- that fallback has now been restored as a temporary stabilization measure

This means:

- `settings` is not a solved final path
- but it is also no longer evidence that every secondary window is generically broken

## 9. What We Have Already Tried

### 9.1 Packaging Hygiene

Implemented:

- fail-loudly stale mirror refresh behavior
- fresh verification extraction directory
- portable verification metadata JSON

Status:

- successful
- this reduced false debugging conclusions significantly

### 9.2 Delayed Reveal

Implemented:

- `show: false`
- wait for readiness before reveal
- small packaged transparent reveal delay

Status:

- helpful, but not sufficient
- transparent main window can still remain invisible

### 9.3 Renderer-Ready Handshake

Implemented:

- preload bridge method for renderer-ready
- main process waits for renderer-ready before reveal
- renderer-ready moved closer to real route-mounted first paint

Status:

- good architectural cleanup
- not yet sufficient to eliminate the transparent packaged main-window invisibility

### 9.4 Packaged-Windows Opaque Fallback Experiments

Implemented:

- ability to force opaque packaged window behavior
- temporary non-transparent fallback for `settings`

Status:

- useful for isolating fault boundaries
- not acceptable as the final product answer unless clearly justified

## 10. Why ElectronMVP Does Not Settle the Question

We also compared against another local project, `F:\ElectronMVP`, which ships a rounded floating window successfully in packaged mode.

Relevant files:

- [src/main/index.ts](/F:/ElectronMVP/src/main/index.ts)
- [src/renderer/src/style.css](/F:/ElectronMVP/src/renderer/src/style.css)
- [src/renderer/src/main.ts](/F:/ElectronMVP/src/renderer/src/main.ts)

Why it is more stable:

- single window only
- no tray-first multi-window coordination
- much simpler renderer
- no React app shell, no router, no theme bootstrap, no i18n bootstrap
- no compact first-launch state machine
- no hover-control parity requirements
- its visual "rounded window" is effectively a transparent host plus one simple rounded panel that fills the entire window

So `ElectronMVP` proves that Electron can ship a packaged rounded transparent utility window.
It does not prove that our more complex product shape is doing something obviously wrong.

## 11. Current Working Hypotheses

These are hypotheses, not final conclusions.

### Hypothesis 1

The hardest remaining failure is not a generic route-load failure.
It is a packaged Windows transparent compositor / utility-window reveal problem on the `main` path.

### Hypothesis 2

`settings` and `main` may not need the exact same packaged-Windows host-window strategy, even if the rendered design system remains the same.

### Hypothesis 3

Our current product shape may be too close to the fragile edge of what Windows packaged transparent Electron utility windows tolerate:

- tiny size
- transparent
- frameless
- always on top
- tray-first
- off-taskbar
- immediate custom interactive chrome

### Hypothesis 4

A final stable solution may require choosing between:

- transparent host window
- or opaque host window with visually transparent-looking inner rounded shell

rather than trying to preserve true native transparency at all costs on packaged Windows.

## 12. Constraints We Care About

Please take these seriously when advising us:

- We do not want a packaged-only redesign.
- We do not want to solve this by adding a native Windows titlebar to `settings`.
- We want development and packaged Windows UI to remain close enough that a user would see them as the same product.
- We prefer a narrow Windows-packaged fix over a broad cross-platform redesign.
- We do not want to reintroduce stale-artifact ambiguity into manual validation.

## 13. Questions We Want the Expert to Answer

### Primary Design Question

For a packaged Windows Electron app with this product shape, what is the right final window-host strategy?

Should we:

1. keep true transparent host windows for `main` and `settings`
2. keep transparency only for `main` and use a non-transparent host for `settings`
3. use a non-transparent host window on packaged Windows, but visually recreate the floating rounded shell inside the renderer

### Packaging / Compositor Question

Is the combination below inherently fragile enough on packaged Windows that we should stop fighting for it as a final shipped contract?

- `frame: false`
- `transparent: true`
- `alwaysOnTop: true`
- `skipTaskbar: true`
- tiny `200x200` utility window
- tray-first reveal

### Reveal Timing Question

For packaged transparent Windows utility windows, what reveal gate is most trustworthy?

- `ready-to-show`
- `did-finish-load`
- custom renderer-ready handshake
- some stricter paint / visibility confirmation strategy

### Secondary Window Question

Is it reasonable to give `main` and `settings` different packaged-Windows host-window policies while keeping the same renderer design system?

### Product-Fidelity Question

If true host transparency is the root instability, what is the least bad production strategy that preserves the intended visual language?

## 14. What Kind of Answer Would Be Most Helpful

The most useful expert answer would include:

- a recommended final window-host strategy
- which assumptions we should stop making
- what experimental branches are still worth trying
- what not to waste more time on
- whether our current goal is realistic under Electron on packaged Windows

Concrete advice is more useful than generic Electron tips.

## 15. Minimal Reproduction Characteristics

If the expert wants the shortest accurate shape of the problem, it is this:

- Electron 41 packaged Windows portable build
- frameless transparent always-on-top tray-first `200x200` utility window
- `skipTaskbar: true`
- React-rendered custom shell with hover controls
- packaged app can report show/focus while the main transparent window is still not human-visible

## 16. Current Status on March 28, 2026

Current status summary:

- packaging/verification hygiene: improved substantially
- packaged diagnostics: available
- main transparent packaged path: still not solved
- settings path: temporarily stabilized with packaged opaque fallback, but not final
- final packaged/development UI parity: not solved yet

That is the point where we are asking for expert advice.
