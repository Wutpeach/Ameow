# Type Safety

> Executable frontend type contracts for Tauri command/event boundaries, the Electron preload bridge, and React state.

---

## Source of Truth

- Frontend consumers: `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/contexts/ThemeContext.tsx`
- Backend producers: `src-tauri/src/lib.rs`

---

## Core Rules

- Use explicit generics for all `invoke<T>()` calls.
- Use typed payloads for all `listen<T>()` calls.
- Keep cross-layer payload keys aligned with backend serde output (for example `updateAvailable`).
- Do not use `any` for Tauri events or command results; prefer concrete types or `unknown` plus guards.
- Runtime validation library is not required, but external/untrusted payloads must be guarded before use.
- New Electron-migrated renderer files must use the typed preload bridge in `src/types/electronBridge.ts` instead of importing `@tauri-apps/*` directly.

---
