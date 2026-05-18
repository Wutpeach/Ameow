# Electron app shell and renderer bridge

## Goal

Create the Electron application shell and typed preload bridge that let the existing React renderer run without direct Tauri dependencies.

## Requirements

* Add Electron main/preload entrypoints and wire them into the repo dev/build flow.
* Introduce a typed renderer-facing desktop bridge owned by the app.
* Replace direct `@tauri-apps/*` imports with app-owned adapters or bridge calls.
* Preserve current multi-window behavior:
  * main floating window
  * settings window
  * context menu window
* Preserve current window constraints and positioning expectations where feasible.
* Keep renderer routing and existing React component structure intact unless a refactor is required to remove Tauri coupling.

## Acceptance Criteria

* [ ] Electron can boot the app shell and render the existing React app.
* [ ] Renderer code no longer depends directly on Tauri packages for migrated surfaces.
* [ ] Window creation and routing cover main, settings, and context-menu surfaces.
* [ ] The bridge API is typed and app-owned instead of framework-owned.

## Out of Scope

* Porting all native integrations.
* Porting downloader process orchestration.
* Final release packaging cutover.

## Technical Notes

* Key files:
  * `package.json`
  * `vite.config.ts`
  * `src/main.tsx`
  * `src/App.tsx`
  * `src/pages/SettingsPage.tsx`
  * `src/pages/ContextMenuPage.tsx`
* Relevant specs:
  * `.trellis/spec/frontend/hook-guidelines.md`
  * `.trellis/spec/frontend/type-safety.md`
  * `.trellis/spec/guides/cross-layer-thinking-guide.md`

## Implementation Notes

* Prefer an adapter layer so renderer components do not know whether the runtime is Electron or something else.
* Keep bridge naming aligned with the foundation task's contract matrix.
