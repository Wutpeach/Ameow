# MR6 Main Window Native / Lifecycle Correctness Closure

## Goal

Close two independently reachable Main Window correctness risks on the clean authoritative integration line without changing the established authority model:

- Risk A: Windows native argument conversion.
- Risk B: terminal Presentation can fail to release the full-window hold and therefore fail to return to Compact.

The outcome of this task is a repository-grounded planning package for GPT Architecture Lead review. Implementation is not authorized in this task state.

## Baseline

- Authoritative branch: `motion/presentation-integration`.
- Authoritative commit: `e8b4e4442155f49eeed0b79d1a2afac1d541f1d6`.
- Authoritative worktree: `D:/Ameow/.cindy-worktrees/motion-integration` (clean during investigation).
- Root `main` and its unrelated dirty Trellis/runtime changes are excluded from implementation evidence.

## Confirmed Requirements

### Risk A — Windows native argument conversion

- The historical compact-reachability chain remains reachable, but its current normal path finite-checks renderer request values and rounds native positions.
- A narrower live defect remains in the current Main Window manual-position IPC boundary: `Number.isNaN` rejects `NaN` but accepts `Infinity` and `-Infinity`, which can reach `BrowserWindow.setPosition` after `Math.round`.
- The repair must stay at the Electron Main native-entry boundary. Renderer drag math, lifecycle, preload method shape, and compact reachability policy must not acquire new authority.
- The repair must reject non-finite coordinates before every native write on the targeted live `ameow:current-window:set-position` channel while preserving valid negative multi-monitor coordinates and integer rounding.

### Risk B — terminal Presentation cannot recover Compact

- Download remains the sole terminal business authority and synchronously publishes the first typed terminal with its exact post-reduction state.
- Application/center-overlay Presentation owns the bounded terminal visibility opportunity and the request-id-guarded `centerOutcome` lock projection.
- The current App does not arm the terminal retention timer until two renderer `requestAnimationFrame` callbacks complete. A hidden/background-throttled Main Window can therefore remain in `task-outcome-loading` with `centerOutcome=true` and never publish the final lock release.
- The lifecycle reducer already handles the final lock release correctly: outside pointer -> `collapsePending`; inside pointer -> remain full until the real leave fact.
- The repair must make Application terminal retention and lock release independent of renderer frame/animation callbacks. It must not move terminal authority into lifecycle or make renderer completion release a lock.

### Repair shape

- Risk A and Risk B are independent and must be implemented as two separately reviewable, separately revertible repair slices.
- Main Window lifecycle reducer remains the only full / compact / transition authority.
- Download/Application remain the only progress / terminal correctness authorities.
- No shared Motion runtime, scheduler, state machine, priority bus, or lifecycle redesign may be introduced.
- Dot Field, shader, mascot, Reveal visuals, and MR7+ are out of scope.

## Acceptance Criteria

- [ ] Risk A rejects `NaN`, `Infinity`, and `-Infinity` at the targeted Main native-entry boundary before `BrowserWindow.setPosition`; valid finite negative and positive coordinates still round and apply once.
- [ ] The compact-reachability lifecycle path remains position-only, epoch-cancellable, and unchanged except for tests/guards needed to prove native argument safety.
- [ ] Risk B arms and completes request-id-guarded terminal retention without waiting for renderer rAF, Motion completion, or any visual callback.
- [ ] Terminal lock release while pointer-outside reaches lifecycle `collapsePending` and matching compact completion enables passthrough; pointer-inside remains full until the real leave fact.
- [ ] A newer Download or newer outcome invalidates stale terminal timers without clearing current Product terminal facts.
- [ ] The two repairs remain independent and do not create a shared mechanism.
- [ ] Architecture guards prove lifecycle, native, Download/Product, and renderer ownership remain single-source with no side channel.
- [ ] Focused automated checks and the packaged Windows manual matrix in `implement.md` pass, with baseline-only failures reported separately.

## Out of Scope

- Product code implementation in this planning turn.
- Task activation, commit, archive, PR, or release work.
- Lifecycle redesign, native window resizing, or compact/full native-bounds animation.
- Dot Field expansion, shader/mascot/Reveal visual work, or MR7+ planning.
- Opportunistic cleanup of legacy `set_window_size` / `set_window_position` command cases that have no current production caller.

## Planning Status

- Blocking product decisions: none; the requested authority and scope constraints fully determine the repair boundaries.
- Architecture escalation: not required by current evidence. The existing authority model is sufficient.
- Review gate: GPT Architecture Lead Planning Architecture Review is required before any later `task.py start`.

