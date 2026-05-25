# Architecture Boundary Refactor Info

## Source Material

- Research audit: `research/architecture-boundary-audit.md`
- Phase 0 archive commit: `87a70b3 refactor(core): resolve runtime type boundary`

## Global Rules

- Complete at most two phases per work session, then stop and report.
- Keep each phase small enough for human review.
- Do not bundle unrelated changes.
- Do not continue when the diff becomes broad, tests fail for unclear reasons, or a boundary risk escalates.
- Before every implementation phase:
  - write a focused local plan
  - consult `claude-consult` on the plan when the phase has broad architecture risk
  - implement only the agreed scope
  - run focused checks
  - consult `claude-consult` on the diff when the phase has broad architecture risk
  - address only concrete, in-scope feedback
  - run checks again
  - commit the phase
  - update this task record
- Preserve these contracts:
  - renderer command names
  - Electron event names
  - WebSocket action names and payload fields
  - `get_config` / `save_config` raw string contract
  - browser-extension packaging shape

## Phase 0: Completed Boundary Fix Archive

Status: completed and committed.

Scope:

- Consolidated duplicate runtime payload types in `src/App.tsx` onto shared types from `src/types/videoRuntime.ts`.
- Moved `RuntimeBinaryPaths` ownership into a runtime-neutral core type.
- Kept `src/electron-runtime/contracts.ts` exporting a compatible `RuntimeBinaryPaths` alias.
- Removed the explicit `src/core` -> `src/electron-runtime` type dependency.
- Confirmed the prior import-cycle scan reported no cycles.

Files committed:

- `src/App.tsx`
- `src/core/index.ts`
- `src/core/types/engine.ts`
- `src/core/types/runtime-binaries.ts`
- `src/electron-runtime/contracts.ts`

Validation run before commit:

- `npm run type-check`: passed
- `npm run lint`: passed
- `npm test`: passed, 108 test files and 653 tests passed
- Import-cycle scan from the prior repair pass reported `cycles: []`

Commit:

- `87a70b3 refactor(core): resolve runtime type boundary`

## Recovery Note

The previous phased refactor execution goal was reasonably blocked because it referenced root-level phase plan/report files that did not exist at the time:

- `PHASED_ARCHITECTURE_REFACTOR_PLAN`
- `PHASED_ARCHITECTURE_REFACTOR_REPORT.md`

The recovery pass first created temporary root-level files to preserve the plan and Phase 0 report, then this Trellis migration moved that material into this task. The root-level temporary files should not remain.

## Worktree Classification After Phase 0

Unrelated or risky changes that must not be included in architecture refactor commits without separate review:

- `PERFORMANCE_RESOURCE_AUDIT.md` deleted: dangerous/unrelated deletion. Do not include without user confirmation.
- `browser-extension/background.js` modified: unrelated or uncertain extension theme broadcast work.
- `browser-extension/floating-launcher.css` modified: unrelated or uncertain theme styling work.

## Phase 1: Extract App Download / Transcode Pure Logic

Goal:

- Move side-effect-free download/transcode helper logic out of `src/App.tsx`.
- Do not split the component.
- Do not change UI behavior.
- Do not change event names or payload shapes.

Candidate scope:

- Download stage ordering and label helper inputs.
- Download/transcode queue payload normalization helpers.
- Progress percent clamping and ETA formatting helpers.
- Queue task sorting helpers.

Out of scope:

- `useEffect` event subscriptions.
- Electron bridge calls.
- DOM, animation, timers, refs, and state ownership.
- Any visual or copy change.

Validation:

- focused new unit tests
- `npm run type-check`
- `npm run lint`
- `npm test`

Stop conditions:

- The extraction requires changing event subscription flow.
- The extraction requires changing runtime payload shape.
- Tests need large mocks of React, Electron, or timers.

## Phase 2: Consolidate Desktop-Side Video Candidate Normalization

Goal:

- Establish one canonical desktop-side normalizer for video candidates.
- Reuse it from both `src/electron-runtime/commandRouter.ts` and `electron/videoHintNormalization.mts`.
- Do not change browser-extension protocol or payload field names.

Candidate scope:

- Extract or relocate existing normalization rules.
- Preserve current Pinterest filtering behavior.
- Preserve current ordering behavior from `orderVideoCandidatesForSite`.

Out of scope:

- Browser-extension JavaScript changes.
- WebSocket action changes.
- New media candidate fields.
- Site routing changes.

Validation:

- existing video hint normalization tests
- existing command router tests
- `npm run type-check`
- `npm run lint`
- `npm test`

Stop conditions:

- Existing tests show behavior drift.
- The shared normalizer needs extension packaging changes.
- The refactor touches extension-side detection logic.

## Phase 3: Renderer-Side Typed Config Helper

Goal:

- Add a renderer-side helper for common config read/patch/save behavior.
- Preserve `get_config` / `save_config` raw string semantics.
- Start with small SettingsPage call sites only.

Candidate scope:

- Wrap parse fallback to `{}`.
- Patch selected keys.
- Persist with `save_config`.
- Provide caller-owned optimistic rollback hooks where already present.

Out of scope:

- Changing Electron config store behavior.
- Introducing dedicated config commands.
- Rewriting all settings at once.
- Changing config key names or defaults.

Stop conditions:

- Helper would need to change invalid JSON persistence behavior.
- The diff touches many unrelated settings sections.
- Existing optimistic UI rollback behavior becomes ambiguous.

Status: completed in child task `05-25-add-typed-renderer-config-helper`.

Files committed:

- `src/desktop/config.ts`
- `src/desktop/config.test.ts`
- `src/pages/SettingsPage.tsx`

Scope completed:

- Added a renderer-only typed config helper above the raw `get_config` / `save_config` command contract.
- Reused the existing defensive config parser so invalid, empty, array, null, or non-object config strings fall back to `{}`.
- Replaced only two low-risk SettingsPage handlers:
  - `toggleAePortal`
  - `toggleExtensionInjectionDebug`
- Left stronger-coupled handlers unchanged for follow-up, including shortcut registration, rename rules, app-update preference, global proxy, AE executable path, and output-path helper consolidation.

Compatibility preserved:

- `get_config` still returns a raw config string.
- `save_config` still receives `{ json: JSON.stringify(config) }`.
- Config file format, keys, field semantics, settings UI behavior, and optimistic rollback paths were not changed.

Validation run before commit:

- `npm test -- src/desktop/config.test.ts`: passed, 9 tests.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 111 test files and 690 tests.
- `git diff --check`: passed with only Windows LF-to-CRLF working-copy warnings.

Commits:

- `8433fc7 refactor(settings): add typed renderer config helper`
- `799dfe9 chore(spec): document renderer config patch helper`

## Phase 4: App Download Event Reducer

Goal:

- Extract runtime event-to-view-state folding for download/transcode events.
- Keep existing React state ownership and event subscriptions initially.
- Do not introduce a new state library.

Candidate scope:

- Convert selected event payload plus previous view state into next view state.
- Keep foreground outcome and timer ownership in `App.tsx` unless a later phase isolates it.

Out of scope:

- Replacing the main window state machine.
- Reworking compact/full window state.
- Changing user-visible queue behavior.

Stop conditions:

- The reducer must own timers, refs, or Electron calls.
- Behavior around cancellation/outcome display cannot be proven equivalent.

## Phase 5: Low-Risk Electron Main Controller Split

Goal:

- Keep `electron/main.mts` as the composition root.
- Move one low-risk command/action family into a focused controller.
- Do not change IPC channels, WebSocket actions, or payloads.

Candidate scope:

- A small command family with existing tests and few global dependencies.
- Constructor or factory receives dependencies from main.

Out of scope:

- Window creation and startup flow.
- WebSocket server lifecycle.
- Site session capture permissions.
- Runtime bootstrap ordering.

Stop conditions:

- The controller needs broad access to global mutable state.
- The split changes initialization order.
- Electron packaged startup risk increases.

## Phase 6: Browser Extension Background Low-Risk Helper Split

Goal:

- Extract pure JavaScript helpers from `browser-extension/background.js`.
- Do not migrate to TypeScript.
- Do not introduce a bundler.
- Preserve `importScripts` packaging.

Candidate scope:

- Pure helper with existing tests or straightforward new tests.
- No Chrome API side effects inside the extracted helper.

Out of scope:

- Service worker lifecycle changes.
- WebSocket connection state ownership.
- Site detector rewrites.
- Protocol field changes.

Stop conditions:

- Extraction needs build tooling.
- Helper depends on live `chrome` APIs.
- Existing uncommitted extension work cannot be safely separated.
