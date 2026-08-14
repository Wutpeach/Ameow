# MR6 Repository-Grounded Evidence Index

The authoritative Planning Architecture Report is `../design.md`. This file records the evidence used to reach it.

## Baseline

- `motion/presentation-integration@e8b4e4442155f49eeed0b79d1a2afac1d541f1d6`.
- Clean worktree: `D:/Ameow/.cindy-worktrees/motion-integration`.
- MR5 archive: `.trellis/tasks/archive/2026-08/08-13-mr5-motion-consolidation-polish/`.

## Risk A anchors

- Lifecycle compact reachability effect: `src/presentation/main-window/lifecycle.ts:133-156`.
- Effect execution: `src/presentation/main-window/effectExecutor.ts:39-71`.
- App native dependencies: `src/App.tsx:381-417`.
- Manual drag native write: `src/presentation/main-window/MainWindowPresentationSurface.tsx:189-226,278-307`.
- Renderer bridge wrapper: `src/desktop/runtime.ts:53-76`.
- Preload methods: `electron/preload.mts:80-102`.
- Main manual position handler: `electron/main.mts:3385-3397`.
- Main compact request normalization: `electron/main.mts:3430-3447`.
- Position-only compact policy: `electron/mainWindowSurfacePolicy.mts:39-74,110-169,192-250`.
- Existing open-risk structural guard: `src/architecture/windows-risk-path.test.ts:5-98`.
- Existing native policy tests: `electron/mainWindowSurfacePolicy.test.mts`.

## Risk B anchors

- Download exact post-reduction terminal publication: `src/features/download/useDownloadQueue.ts:200-220,268-278`.
- App terminal selection and durations: `src/App.tsx:1345-1413`.
- Outcome loading/rAF/timer chain: `src/App.tsx:625-632,787-833`.
- Center-overlay request-id transitions and lock projection: `src/utils/centerOverlayState.ts:80-150,179-184`.
- App lock derivation: `src/App.tsx:542-550,575-592`.
- Surface lock dispatch: `src/presentation/main-window/MainWindowPresentationSurface.tsx:673-685`.
- Lifecycle release/collapse behavior: `src/presentation/main-window/lifecycle.ts:159-176,249-260,318-367`.
- Existing reducer proof: `src/presentation/main-window/lifecycle.test.ts:186-217`.
- Reachable hide paths: `src/App.tsx:3587-3596`; `electron/main.mts:2396-2404`.
- BrowserWindow default background scheduling configuration: `electron/main.mts:698-721` (no `backgroundThrottling` override).
- Normative authority rules: `.trellis/spec/frontend/state-management.md:328-344`; `.trellis/spec/frontend/motion-guidelines.md:603-613`.

## Focused test run

```text
npm test -- src/architecture/windows-risk-path.test.ts electron/mainWindowSurfacePolicy.test.mts electron/preloadBridgeContract.test.mts src/utils/centerOverlayState.test.ts src/presentation/main-window/lifecycle.test.ts src/presentation/main-window/presentationCompletion.test.ts
```

- Passed: five files, 56 tests.
- Baseline failure: `electron/preloadBridgeContract.test.mts` source parser expects LF block delimiters and fails on the Windows CRLF checkout before contract assertions.

## Conclusions

1. Risk A's compact-reachability half is already defensive; the remaining actionable defect is the manual position handler's NaN-only guard.
2. Risk B is an Application scheduling/retention defect. The lifecycle reducer already implements the correct release behavior.
3. The repairs are independent and need no shared infrastructure or authority change.

