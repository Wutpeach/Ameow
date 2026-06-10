# Implementation Plan: Conditional site-session refresh before advanced quality probe

## Pre-flight

- Read `prd.md` and `design.md`.
- Load backend Trellis specs before editing.
- Keep this task scoped to advanced-quality probing.

## Checklist

### 1. Runtime hook contract

- [x] Add an optional `refreshSiteSessionBeforeAdvancedQualityProbe` callback to Electron runtime options/contracts.
- [x] Keep the callback generic and injected; do not import Electron site-session modules into `src/electron-runtime/service.ts`.
- [x] Call the hook in the advanced-quality probe context path before `buildExecutionContext(...)` injects saved cookies.

Validation:

- [x] Type-check runtime contracts.
- [x] Add a runtime test proving normal non-advanced downloads do not call this hook.

### 2. Electron main policy

- [x] Implement the hook in `electron/main.mts`.
- [x] Gate it to YouTube and Bilibili in V1.
- [x] Check registry authorization:
  - allow `seeded`
  - allow `user_enabled`
  - skip unauthorized `auto_discovered`
- [x] Check saved snapshot staleness with a code-owned threshold.
- [x] Skip sync when the extension bridge has no connected client or cannot sync.

Validation:

- [x] Reused existing Electron bridge/site-session tests and added runtime hook tests. Electron main policy remains covered by code review and `electron:build`; no separate pure helper test was added in this pass.

### 3. Timeout and fallback

- [x] Wrap pre-probe sync with an explicit short timeout.
- [x] On timeout or failure:
  - log a diagnostic line
  - continue probe with the currently saved snapshot
  - do not emit a new user-facing failure solely for refresh failure

Validation:

- [x] Test sync throw/timeout still runs probe.

### 4. In-flight dedupe

- [x] Add site-level in-flight promise map in Electron main.
- [x] Reuse the same promise for concurrent pre-probe refreshes on the same site.
- [x] Clear the map entry in `finally`.

Validation:

- [x] Implemented site-level in-flight dedupe in Electron main. A separate concurrent Electron-main unit test was not added because this logic currently lives in `main.mts`.

### 5. Final checks

- [x] Run focused tests touched by runtime/Electron sync changes.
- [x] Run:
  - `npm run type-check`
  - `npm run lint`

## Rollback Points

- If pre-probe sync causes instability, disable the hook wiring while preserving existing advanced-quality probe behavior.
- If staleness policy is difficult to test through Electron main, keep the policy small and covered by a pure helper test.
