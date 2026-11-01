# MR6 Proposed Implementation Plan

Planning artifact only. Do not run `task.py start` until GPT Architecture Lead approves this report and a later user message explicitly authorizes implementation.

## Entry Gates

1. Create the implementation branch/worktree from clean `motion/presentation-integration@e8b4e44` (or its deliberate reviewed successor), never from dirty root `main`.
2. Re-read `design.md`, the selected frontend Motion/state specs, the Electron runtime overview, and the cross-layer boundary guide.
3. Confirm no later commit already closed either risk; if it did, re-run the corresponding evidence before editing.

## Repair A — Finite Main Window Native Coordinates

1. Add a focused failing regression around the targeted Main Window set-position conversion/native-call seam:
   - reject `NaN`, `Infinity`, and `-Infinity` in either coordinate;
   - accept finite negative and positive coordinates;
   - preserve integer rounding and exactly one native call.
2. Replace the handler's NaN-only acceptance condition with finite-coordinate validation at the Electron Main entry point.
3. Update `src/architecture/windows-risk-path.test.ts` so Risk A asserts the repaired boundary and continues to pin the renderer -> preload -> Main -> native chain.
4. Keep `electron/mainWindowSurfacePolicy.mts`, lifecycle, Surface drag batching, and preload API unchanged unless a new failing focused test proves a necessary local correction.
5. If `electron/preloadBridgeContract.test.mts` still fails only because its source parser assumes LF, make that test parser normalize CRLF as a test-only prerequisite; do not change production bridge behavior.

Rollback point: the Main finite guard and its focused tests form one isolated repair.

## Repair B — Application-Owned Terminal Retention Cannot Wait for rAF

1. Add a failing focused regression that drives the existing terminal outcome policy with fake timers while renderer rAF never fires.
2. Reorder only the existing App outcome wiring so:
   - terminal selection still uses Download's exact post-reduction snapshot;
   - existing full intent is issued;
   - the center outcome becomes visible and its request-id timer is armed without renderer frame/animation completion;
   - timeout or new-primary invalidation derives `centerOutcome=false` through existing state.
3. Delete the two-rAF correctness dependency if it has no remaining visual-only caller. Do not replace it with another callback, fallback timer, scheduler, or state machine.
4. Preserve current 1500 ms success/cancelled and 5000 ms failure retention, stale request-id no-ops, and new-primary interruption.
5. Add a cross-boundary regression proving the resulting final lock release enters existing lifecycle `collapsePending` when outside and remains full until leave when inside.
6. Leave lifecycle reducer, completion acknowledgement, Download controller/model, Dot Field terminal projection/runtime, and native policy unchanged.

Rollback point: App outcome scheduling and its tests form one isolated repair, independent from Repair A.

## Automated Validation

Focused gates:

```text
npm test -- src/architecture/windows-risk-path.test.ts electron/mainWindowSurfacePolicy.test.mts electron/preloadBridgeContract.test.mts
npm test -- src/utils/centerOverlayState.test.ts src/presentation/main-window/lifecycle.test.ts src/presentation/main-window/presentationCompletion.test.ts
npm test -- src/presentation/main-window/downloadTerminalProjection.test.ts src/features/download/useDownloadQueue.test.ts
npm test -- <new Risk A test> <new Risk B Application/cross-boundary test>
```

Architecture and repository gates:

```text
npm test -- src/architecture/import-guard.test.ts
npm test
npm run type-check
npm run lint
npm run build
git diff --check
```

Every baseline-only failure must be recorded separately. A directly relevant broken gate (including the known CRLF preload parser) must be made executable or explicitly replaced by equivalent focused evidence before claiming closure.

## Packaged Windows Validation

### Repair A matrix

- Manual drag within one monitor and across monitors with negative origins.
- Normal/reduced-motion collapse from center and every work-area edge.
- Repeated collapse/expand cancellation while reachability correction is active.
- Inject `NaN`, `Infinity`, and `-Infinity` through the exposed current-window position method; confirm no native conversion exception and no movement.

### Repair B matrix

- Success, cancelled, and failure terminal while pointer is outside: bounded outcome then Compact/passthrough.
- Same terminals while pointer is inside: remain full until real pointer leave, then Compact.
- Hide Main Window while a download is active; let it terminate while hidden; reopen and prove no permanent loading/lock state.
- Start a new Download during terminal retention; old outcome/timer becomes stale and current work holds full through normal Product facts.
- Repeat with Reduced Motion; correctness and timing ownership remain unchanged.

## Non-Work

- No task activation in this planning turn.
- No lifecycle redesign or new phase/lock.
- No native resize/bounds animation.
- No shared runtime, scheduler, state machine, or bus.
- No Dot Field, shader, mascot, Reveal, or MR7+ work.
- No commit, archive, PR, or release.

## Implementation Result — Awaiting GPT Architecture Lead Review

Implemented on `mr6/native-lifecycle-correctness` from
`motion/presentation-integration@e8b4e44` in the isolated
`D:\Ameow\.cindy-worktrees\mr6-correctness` worktree.

### Repair A

- The targeted `ameow:current-window:set-position` Main handler now resolves
  manual coordinates through a finite-coordinate boundary before its single
  native `setPosition` write.
- `NaN`, `Infinity`, and `-Infinity` are rejected in either coordinate.
- Finite positive and negative values retain the existing `Math.round`
  semantics. Renderer ownership, preload API, compact reachability, and native
  lifecycle policy are unchanged.

### Repair B

- `showForegroundTaskOutcome` still issues the existing full intent, but it now
  publishes the visible outcome and arms the existing request-id retention
  timer synchronously, without waiting for renderer `requestAnimationFrame` or
  any Motion/visual completion callback.
- Existing success/cancelled `1500 ms`, failure `5000 ms`, stale request no-op,
  new-primary invalidation, Download post-reduction terminal selection, and
  `centerOutcome` lifecycle projection remain unchanged.
- No Download, lifecycle, Dot Field, completion, native compact policy, or
  shared scheduling production code changed.
- The authoritative Motion spec now records the MR6 closure boundaries instead
  of leaving the two risks marked open.

### Validation

- Focused MR6 and adjacent gates: 10 files / 103 tests passed, including an
  inert-rAF fake-timer contract for all terminal durations, pointer
  outside/inside, stale completion, and new-primary invalidation.
- Architecture import guard: 1 file / 22 tests passed.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Full `npm test`: 195 files passed and 1 file failed; 1712 tests passed and 1
  failed. The sole failure is the pre-existing CRLF-sensitive source parser in
  `browser-extension/architecture-guard.test.js`, reproduced unchanged on the
  clean authoritative `e8b4e44` baseline. It is recorded as baseline-only and
  was not pulled into MR6.
- The directly relevant preload bridge contract had the separately known CRLF
  parser defect; its test-only source reader now normalizes CRLF and the gate
  passes without production preload changes.

Task remains `in_progress`. No commit or archive was performed.

### Cindy Lead Review

Architecture PASS. No findings remain after synchronizing the MR6 closure spec
and adding the inert-rAF fake-timer regression. The review confirmed both
repairs are independent/minimal; Native, Product, Presentation, and lifecycle
authority remain single-source; and no visual callback gates terminal
retention or lifecycle lock release.

## Final Closure

GPT Architecture Lead Final Review: PASS.

Packaged Windows validation passed the reachable Risk A and Risk B matrix:

- finite-coordinate rejection produced no native exception or movement;
- same-monitor and positive-origin cross-monitor drag, normal/reduced-motion
  edge collapse, and repeated reachability cancellation behaved correctly;
- success/cancelled/failure retention, pointer-inside/outside behavior,
  hidden-window recovery, new-primary invalidation, and Reduced Motion
  ownership all behaved as planned.

Negative-origin multi-monitor packaged validation remains **NOT VERIFIED**
because the available physical topology was `(0,0)` plus a positive-origin
secondary display. GPT Architecture Lead accepted this as environment-specific
Final Validation / Integration Polish debt, not an observed Risk A failure;
it must not be recorded as PASS.

Work commit: `710fe5e` (`fix(presentation): close MR6 native lifecycle correctness`).
The commit was fast-forwarded to the authoritative
`motion/presentation-integration` line before task archival.
