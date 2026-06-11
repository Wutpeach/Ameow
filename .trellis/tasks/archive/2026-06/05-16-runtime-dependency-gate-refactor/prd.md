# refactor: extract runtime dependency gate state

## Goal

Extract Electron main-process runtime dependency gate state management from `electron/main.mts` into a focused, testable module. This should complete the runtime dependency subsystem boundary started by the download command bridge and managed runtime bootstrap refactors: bootstrap modules own "how runtimes are prepared", while the gate module owns "what state the renderer sees while preparation runs".

## What I Already Know

- Parent task: `05-16-download-architecture-refactor`.
- Recent completed commits:
  - `206bf88 refactor(electron): route downloads through runtime bridge`
  - `b36c7da refactor(electron): extract managed runtime bootstrap`
- Current `electron/main.mts` is still large at about 5830 lines.
- Manual verification after clearing `userData/runtimes` passed: `yt-dlp`, `gallery-dl`, `ffmpeg`, and `deno` download and become ready; extension-assisted pasted download fallback/resolution still queues correctly.
- Claude architecture review recommended this as the next phase before app updater or window/tray lifecycle extraction because it directly builds on managed runtime bootstrap, has clear state-machine boundaries, and is highly testable.
- There is already `src/electron-runtime/runtimeDependencyGate.ts`; that file is runtime resolver logic, not the Electron main UI/event gate controller. This task must avoid blurring those two responsibilities.

## Requirements

- Add a new Electron main-side module, likely `electron/runtimeDependencyGate.mts`.
- Move UI/event gate state management out of `electron/main.mts` without changing renderer-facing payloads, command names, or event names.
- Keep Electron-specific dependencies injected from `main.mts`; the new module must not import `app`, `BrowserWindow`, `ipcMain`, or window maps.
- Preserve UI Lab runtime gate override behavior.
- Preserve bootstrap de-duplication behavior through the existing `runtimeDependencyBootstrapPromise` semantics.
- Preserve bootstrap order: `ytDlp`, `galleryDl`, `ffmpeg`, `deno`.
- Preserve `runtime-dependency-gate-state` event payload shape and command behavior for:
  - `get_runtime_dependency_gate_state`
  - `refresh_runtime_dependency_gate_state`
  - `start_runtime_dependency_bootstrap`

## Candidate Scope

Move or wrap these `electron/main.mts` responsibilities:

- `runtimeDependencyGateState`
- `runtimeDependencyBootstrapPromise`
- `nextManagedRuntimeComponent`
- `emitRuntimeDependencyGateState`
- `applyRuntimeDependencyGateState`
- `syncRuntimeDependencyGateStateFromSnapshot`
- `updateRuntimeDependencyGateDownloadActivity`
- `getRuntimeDependencyGateState`
- `refreshRuntimeDependencyGateState`
- `ensureMissingManagedRuntimesReady`
- `startRuntimeDependencyBootstrap`

Keep in `main.mts` or inject from `main.mts`:

- `emitAppEvent`
- UI Lab override ownership if keeping all UI Lab scenario state together proves cleaner
- `getRuntimeDependencyStatus`
- `buildManagedRuntimeBootstrapOptions`
- `ensureManagedYtDlpRuntimeReady`
- `ensureManagedGalleryDlRuntimeReady`
- `ensureManagedFfmpegRuntimeReady`
- `ensureManagedDenoRuntimeReady`

## Acceptance Criteria

- [ ] `electron/main.mts` delegates runtime gate state behavior to the new module.
- [ ] Renderer-facing command/event contracts remain unchanged.
- [ ] UI Lab runtime status/gate override still works.
- [ ] Concurrent `start_runtime_dependency_bootstrap` calls still return the current in-progress payload and do not start duplicate bootstrap work.
- [ ] Download activity updates still compute progress percent consistently:
  - positive downloaded/total -> clamped percentage
  - installing/verifying without totals -> `100`
  - unknown totals while downloading/checking -> `null`
- [ ] Fresh missing managed runtimes still flow through checking -> downloading/installing/verifying -> ready.
- [ ] Bundled downloader failure path still enters `failed` with a useful error.

## Definition of Done

- Tests added or updated for the new module.
- `npm test` passes.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npx tsc -p tsconfig.electron.json --noEmit` passes.
- `git diff --check` passes.
- Electron dev smoke passes.
- If implementation changes cross-layer contracts or exposes a new pattern, update `.trellis/spec/backend/electron-runtime-contracts.md`.

## Out of Scope

- Do not change managed runtime download/install behavior in `electron/managedRuntimeBootstrap.mts`.
- Do not refactor `src/electron-runtime/runtimeDependencyGate.ts` unless a naming or contract collision blocks this task.
- Do not extract app updater / `downloadToFile`.
- Do not extract window/tray/globalShortcut lifecycle.
- Do not change renderer UI copy, layout, or runtime gate UX.
- Do not change command/event names or payload fields.

## Technical Notes

- Main-process source range currently starts around `electron/main.mts:3039` for clone/UI Lab helpers and around `electron/main.mts:3090` for gate state functions.
- Existing shared types live in `src/types/runtimeDependencies.ts`.
- Existing frontend helpers live in `src/utils/runtimeDependencyGate.ts`.
- Existing runtime resolver gate logic lives in `src/electron-runtime/runtimeDependencyGate.ts`; keep this distinct from the Electron main UI/event gate module.
- Existing managed runtime bootstrap module is `electron/managedRuntimeBootstrap.mts`.
- Relevant recent validation from parent task:
  - `npm test`
  - `npm run type-check`
  - `npm run lint`
  - `npx tsc -p tsconfig.electron.json --noEmit`
  - Electron dev smoke
  - manual clear-runtimes bootstrap test

## Proposed Test Coverage

- `electron/runtimeDependencyGate.test.mts`
  - ready snapshot -> gate phase `ready`
  - missing managed components -> gate phase `idle` with ordered `nextComponent`
  - bundled `yt-dlp` or `gallery-dl` missing -> gate phase `failed`
  - `updateDownloadActivity` progress calculation for downloading/installing/verifying
  - start bootstrap returns initial checking payload
  - duplicate start while bootstrap promise exists does not invoke bootstrap twice
  - bootstrap failure maps error through `lastError` and clears in-flight promise
  - UI Lab override returns/emits override payload and bypasses real refresh/bootstrap

## Claude Review Summary

Claude recommended the next priority order:

1. Extract runtime dependency gate state management.
2. Then consider app updater / `downloadToFile`.
3. Defer window/tray/shortcut lifecycle until a dedicated design pass.
4. Do not pause for a standalone stabilization phase; continue small refactors with tests.

Reasoning: gate state extraction directly completes the runtime dependency subsystem, has lower blast radius than window lifecycle work, and can be covered with deterministic state-machine tests.
