# MR6 Planning Architecture Report

## Executive Decision

Both MR6 risks remain actionable, but Risk A must be stated narrowly:

- **Risk A: OPEN, narrowed to the live Main IPC finite-number boundary.** The normal compact-reachability path is already finite-checked and integer-normalized, so the repository does not prove that the historical compact-collapse failure still reproduces from ordinary UI input. A real boundary defect nevertheless remains: the live manual-position handler rejects only `NaN`, so non-finite numbers can still be passed to Electron's native `BrowserWindow.setPosition` conversion.
- **Risk B: OPEN and directly reachable.** Terminal outcome retention and its lifecycle lock release are downstream of two renderer rAF callbacks. A hidden/background-throttled window can strand Application state in `task-outcome-loading`, leaving `centerOutcome` active and preventing the otherwise-correct lifecycle reducer from entering Compact.

The risks have different owners, causes, and verification seams. Plan two minimal implementation repairs. Do not unify them.

## Authoritative Baseline

- Branch: `motion/presentation-integration`.
- Commit: `e8b4e4442155f49eeed0b79d1a2afac1d541f1d6`.
- Worktree: `D:/Ameow/.cindy-worktrees/motion-integration`, clean during investigation.
- MR5 explicitly left both Windows risks open; its implementation did not touch either chain.

## Authority Map

```text
Download reducer/controller
  -> typed terminal + exact post-reduction snapshot        [terminal truth]
  -> App center-overlay request-id/timer policy             [bounded Presentation hold]
  -> centerOutcome lock fact
  -> Main Window lifecycle reducer                          [full/compact/transition truth]
  -> effect executor
  -> renderer/preload/Main native adapter                   [native effects only]

Surface manual drag
  -> typed desktop bridge
  -> preload fire-and-forget IPC
  -> Electron Main finite validation                        [native trust boundary]
  -> BrowserWindow.setPosition
```

The proposed repairs change only the two bracketed boundary behaviors. No authority moves between layers.

## Risk A — Windows Native Argument Conversion

### Verdict

**成立，但必须窄化。** The historical risk guard currently conflates two live paths:

1. lifecycle-owned compact reachability, which is already defensive; and
2. Surface-owned manual drag positioning, whose Main handler still has an incomplete finite-number check.

There is no repository evidence that ordinary current drag or compact-collapse inputs naturally produce non-finite values. The defect is still real at the exposed renderer-to-Main trust boundary: JavaScript can provide `Infinity`, `Number.isNaN(Infinity)` is false, `Math.round(Infinity)` remains `Infinity`, and Electron then receives an invalid native coordinate.

### Reachable chains

#### A1. Compact reachability — reachable, currently normalized

```text
lifecycle beginCollapse
  lifecycle.ts:133-156
    -> native.prepareCompactReachability
  effectExecutor.ts:54-56
    -> App beginCompactReachability
  App.tsx:391-400
    -> desktopCurrentWindow.ensureMainWindowCompactReachable
  desktop/runtime.ts:72-74
    -> preload invoke
  electron/preload.mts:98-100
    -> Main request normalization
  electron/main.mts:3430-3447
    -> position-only policy
  electron/mainWindowSurfacePolicy.mts:39-74,110-169,192-245
    -> BrowserWindow.setPosition(integer, integer)
```

Main uses `Number.isFinite` fallbacks for `reachableFrameSize` and `edgePadding`. The policy rounds bounds/frame/padding and each interpolation frame. This chain must remain unchanged unless a failing test proves otherwise.

#### A2. Manual Main Window position — reachable finite-validation gap

```text
Surface drag frame
  MainWindowPresentationSurface.tsx:189-207,220-226
    -> desktopCurrentWindow.setPosition
  desktop/runtime.ts:66-68
    -> preload send
  electron/preload.mts:92-94
    -> Main handler
  electron/main.mts:3385-3397
    -> Number(payload.x/y)
    -> Number.isNaN only
    -> BrowserWindow.setPosition(Math.round(x), Math.round(y))
```

Normal Surface inputs come from Electron `outerPosition()` plus pointer `screenX/screenY` and are rounded before sending. This explains why MR2 Windows smoke did not reproduce the historical error. It does not make the native boundary correct for every value the exposed IPC channel can receive.

### Root cause

Validation is expressed as “not NaN” rather than “finite native coordinate.” Electron's native conversion requires finite integral coordinates; the Main boundary enforces only part of that contract.

### Minimal repair boundary

- Change only the targeted `ameow:current-window:set-position` Main handler so both converted coordinates must be finite before rounding/native dispatch.
- Preserve finite numeric coercion behavior, negative multi-monitor coordinates, fire-and-forget preload behavior, and one native write per accepted position.
- Update the Windows risk guard so it proves closure (finite rejection), rather than pinning the existing `Number.isNaN` defect as an indefinitely open risk.
- Do not change lifecycle, drag scheduling, preload API shape, native compact policy, or renderer coordinate ownership.
- Do not bundle the unrelated no-production-caller `set_window_size` / `set_window_position` command cleanup.

## Risk B — Terminal Presentation Cannot Recover Compact

### Verdict

**成立。** The lifecycle reducer is not the root cause. Application currently withholds the state transition that would release the lifecycle lock until renderer frame callbacks run.

### Reachable chain

```text
Download terminal event
  useDownloadQueue.ts:200-220
    -> reducer terminalReceived first
    -> terminal listener receives exact post-reduction state
App terminal selection
  App.tsx:1366-1408
    -> suppress background terminal / choose success|cancelled|failure
App bounded outcome policy
  App.tsx:787-827
    -> beginTaskOutcomeLoading
    -> requestFull("foreground")
    -> await requestAnimationFrame twice (App.tsx:625-632)
    -> showTaskOutcome
    -> only then arm finishTaskOutcome timeout
center overlay lock projection
  centerOverlayState.ts:99-127,179-184
  App.tsx:542-550,578-592
    -> centerOutcome=true while loading/visible
Surface -> lifecycle
  MainWindowPresentationSurface.tsx:673-685
  lifecycle.ts:249-260
    -> false release outside would start collapsePending
    -> but false is never published while loading is stranded
```

The hidden state is product-reachable: the App can hide the current Main Window (`App.tsx:3587-3596`) and the global shortcut can also hide it (`electron/main.mts:2396-2404`) while Download work continues. BrowserWindow creation leaves `backgroundThrottling` at its Electron default (`electron/main.mts:698-721`). Renderer rAF is therefore not a correctness-grade scheduler for the terminal hold.

### Root cause

The Application-owned terminal Presentation state machine and request-id timer are incorrectly downstream of renderer frame availability. The two-frame wait was introduced for visual sequencing, but it became a prerequisite for:

- leaving `task-outcome-loading`;
- starting the semantic retention timer;
- eventually deriving `centerOutcome=false`; and
- allowing lifecycle collapse.

That is a renderer callback side channel into terminal/lifecycle correctness and contradicts `.trellis/spec/frontend/state-management.md:328-344` and `.trellis/spec/frontend/motion-guidelines.md:603-613`.

### Why the lifecycle model is sufficient

- `lifecycle.ts:249-260` starts the normal collapse delay when the final lock releases while the pointer is outside.
- `lifecycle.test.ts:186-217` proves both required branches: outside releases to `collapsePending`; inside remains full until the real pointer leave.
- Matching compact completion alone enables passthrough (`lifecycle.ts:318-367`).

No reducer change or lifecycle redesign is justified.

### Minimal repair boundary

- In the existing App/center-overlay outcome path, make `showTaskOutcome` and the request-id-guarded retention timeout independent of rAF/Motion/visual completion.
- Request full through the existing lifecycle intent before or alongside publishing the visible outcome, then arm the semantic timer immediately from Application policy.
- Remove the two-rAF wait from the correctness chain. If any frame wait remains for purely visual polish, it must not gate state, timer creation, lock release, terminal classification, or lifecycle events.
- Keep all existing request-id checks, new-primary invalidation, outcome durations, and Download post-reduction selection rules.
- Do not change Download model/reducer/controller, lifecycle reducer, Dot Field terminal projection/runtime, shell completion callback, or native policy.

## Independence and Repair Packaging

| Repair | Owner | Root cause | Minimal production boundary | Independent rollback |
| --- | --- | --- | --- | --- |
| A — finite native coordinates | Electron Main native entry | incomplete finite validation | `electron/main.mts` targeted position handler | yes |
| B — terminal hold release | App center-overlay Presentation policy | semantic timer gated by renderer rAF | `src/App.tsx` existing outcome wiring | yes |

Implement as two ordered, separately reviewed repair slices (and preferably two work commits). They share no production helper, timer, state, or abstraction. Either repair may be reverted without changing the other.

## Validation Strategy

### Repair A

- Add a focused handler/conversion regression proving `NaN`, `Infinity`, and `-Infinity` never call the native setter.
- Prove valid fractional and negative multi-monitor coordinates round once and reach the setter once.
- Preserve `mainWindowSurfacePolicy.test.mts` coverage for clamp, reduced-motion snap, cancellation, and destroyed windows.
- Update `windows-risk-path.test.ts` from an open-risk presence assertion to a finite-boundary closure assertion.
- Run preload parity. On the investigated Windows checkout it has a known CRLF-sensitive parser failure; make that test line-ending robust only if required to restore this directly relevant gate, without changing bridge production code.
- Packaged Windows: normal manual drag across positive/negative monitor origins; repeated collapse at each edge; injected non-finite payload produces no native exception or movement.

### Repair B

- Add a focused Application outcome-retention regression with fake timers and a rAF collaborator that never fires. The terminal outcome must still become bounded and release its lock.
- Prove success/cancelled durations (1500 ms) and failure duration (5000 ms), request-id stale no-op behavior, and new-primary interruption.
- Reuse lifecycle reducer tests for outside/inside lock-release behavior; add one cross-boundary test/harness proving Application `centerOutcome=false` feeds that reducer path.
- Assert no animation/rAF callback dispatches `setLock`, `collapseTimerFired`, or terminal mutation.
- Packaged Windows: visible terminal outside -> Compact; visible terminal inside -> full until leave -> Compact; terminal while hidden -> reopen with no permanent hold; success/failure/cancelled; new download during retained outcome; Reduced Motion.

### Focused baseline evidence already run

Command:

```text
npm test -- src/architecture/windows-risk-path.test.ts electron/mainWindowSurfacePolicy.test.mts electron/preloadBridgeContract.test.mts src/utils/centerOverlayState.test.ts src/presentation/main-window/lifecycle.test.ts src/presentation/main-window/presentationCompletion.test.ts
```

Result on `e8b4e44`: five files passed; 56 tests passed. `electron/preloadBridgeContract.test.mts` failed its known CRLF-sensitive source parser before assertions. This is baseline validation debt, not evidence against either diagnosis.

## Architecture Review Gates

Return to GPT Architecture Lead instead of widening implementation if either repair appears to require:

- Download model/reducer/controller or terminal classification changes;
- lifecycle phase, lock vocabulary, reducer, or projection changes;
- renderer completion releasing a lock or dispatching lifecycle progression;
- native bounds resizing or a new native window state;
- a shared scheduler/runtime/state machine/priority bus;
- Dot Field, Character, shader, mascot, or Reveal visual changes.

Current evidence does not trigger any gate. The existing authority model is sufficient.

