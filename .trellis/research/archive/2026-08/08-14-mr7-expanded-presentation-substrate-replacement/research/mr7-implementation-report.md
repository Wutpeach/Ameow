# MR7 Implementation Report

Date: 2026-08-14  
Status: **IMPLEMENTED — CINDY LEAD PASS — awaiting GPT Architecture Lead Implementation Architecture Review**

## Baseline and stop state

- Authoritative implementation worktree:
  `D:\Ameow\.cindy-worktrees\motion-integration`
- Branch/base: `motion/presentation-integration@710fe5e`
- MR7 changes remain uncommitted.
- Trellis task remains `in_progress`.
- No archive, Intake Reveal, Folder Confirmation Reveal, or later MR work was
  entered.

## Implemented architecture

Dependency direction is now:

```text
Download/Application facts
  -> pure Progress / Terminal Presentation projection
  -> MainWindowPresentationSurface
  -> ExpandedPresentationSurface
  -> consumer-local WebGL2 execution
  -> pixels
```

### Neutral durable targets

`expandedPresentationTargets.ts` now owns only the existing durable target
shapes:

- progress: `idle | determinate(traceId, target) |
  indeterminate(traceId)`;
- terminal: `none | terminal(success | failure | cancelled)`.

No scene, reveal, layer, command, future-feature, scheduler, backend, or
generic Motion API was added.

`downloadProgressProjection.ts` and `downloadTerminalProjection.ts` now return
those neutral targets. The terminal resolver was renamed to
`resolveDownloadTerminalTarget`. Projection bodies and Application-owned
retention/invalidation behavior were not moved into the renderer.

### Concrete Expanded host

`ExpandedPresentationSurface.tsx` is the sole production Expanded graphics
host. It provides:

- one `aria-hidden`, noninteractive fullscreen canvas;
- one concrete no-dependency WebGL2 fullscreen-triangle renderer;
- a sufficient non-final recipe for idle, quantitative determinate,
  non-quantitative indeterminate, success, failure, and cancelled targets;
- bounded DPR (2x backing cap), raw monitor-scale observation, layout-size
  resize handling, and no per-frame layout read;
- context creation/compile/link failure isolation;
- context loss/restoration and program cleanup;
- clear-on-sleep so Compact never keeps stale Expanded pixels;
- no renderer callback to Product, lifecycle, terminal retention, native, or
  IPC authority.

`expandedPresentationRuntime.ts` is a consumer-local execution helper, not a
shared runtime. It owns only reconstructible progress interpolation,
generation invalidation, and at most one pending frame. It preserves immediate
downward clamp, trace replacement, latest target coalescing, current-progress
priority, wake reconstruction, Reduced Motion static semantics, and no local
terminal retention. Idle/sleep/dispose leave zero pending frames.

### Atomic retirement

The production Surface now mounts exactly one
`ExpandedPresentationSurface`. In the same cutover:

- `DotFieldCanvas.tsx`, `dotFieldRuntime.ts`, `dotFieldRecipe.ts`, and
  `dotFieldSurface.ts` were deleted;
- all five Dot-only host/recipe/runtime/performance/surface test modules were
  deleted;
- Dot-only click/context intent and pending-click wiring was removed;
- `dotDormant` / `dotAck` theme tokens were removed;
- production search returns zero `DotField`, `dotField`, `dotDormant`, or
  `dotAck` references;
- no fallback, feature flag, compatibility adapter, hidden second canvas,
  dual write, second backend, or speculative Intake/Folder API exists.

Existing Main Window lifecycle, Download/Application correctness,
center-outcome retention/lock code, Pointer Field, Compact Character, and
accessible progress/cancel/outcome/diagnostic DOM remain in their prior
authority layers.

## Validation

### Passing

- Focused MR7 semantic/resource/architecture/retention suites: **75 / 75**.
- `npm run type-check`: **PASS**.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**.
- `git diff --check`: **PASS** (line-ending conversion warnings only).
- Explicit production retirement search: **zero references**.
- Independent Develop Worker review (DeepSeek V4 Flash, max): **PASS, no
  blocking findings**.

The full Vitest run completed **1627 / 1628 passing**. Its only failure is the
pre-existing Windows-CRLF-sensitive assertion at
`browser-extension/architecture-guard.test.js:277`, which requires the
listener suffix to contain LF-only `"return false;\n});"`. The source has the
correct `return false;` behavior, no browser-extension source is in the MR7
diff, and the focused MR7 architecture suites pass. This is disclosed as
validation debt rather than changed outside MR7 scope.

### Windows Electron

Real repository Electron/Chromium validation is **VERIFIED**:

- exactly one production canvas;
- real WebGL2 context;
- current shader program present and linked;
- `gl.getError() == NO_ERROR`;
- Expanded `200 x 200` CSS/client/backing/drawing-buffer dimensions at DPR 1;
- Compact `60 x 60` then re-Expanded `200 x 200` reconstruction;
- one context-lost and one context-restored event;
- linked program and `NO_ERROR` after restore;
- decorative canvas remained `aria-hidden` / noninteractive and accessible DOM
  remained separate.

Evidence:

- `research/mr7-windows-electron-validation.md`
- `research/mr7-windows-electron.png`

The first runtime pass exposed a transformed-rect backing-size defect
(`176 x 176` under a settled `200 x 200` layout). Cindy Lead fixed it by using
`clientWidth/clientHeight`; the repeated evidence is `200 x 200` throughout.

`npm run package:win:dir` was attempted but did not reach Electron Builder:
the external Python runtime acquisition prerequisite remained pending with no
output for more than five minutes. Its exact process group was terminated.
Therefore the unpacked packaged-directory artifact is **NOT VERIFIED due to an
external packaging prerequisite**, not because WebGL2 failed. No alternate
backend/fallback was added.

macOS is **NOT VERIFIED**.

## Cindy Lead review

Verdict: **PASS**.

- Product/Application, terminal retention, lifecycle reducer, native, and
  centerOutcome lock authority remain outside the graphics host.
- Durable MR3/MR4 semantics are preserved in neutral projection/runtime tests.
- Renderer state is bounded, disposable, reconstructible, and non-semantic.
- Atomic retirement and exclusive production-host guards prevent dual
  substrate / duplicate source of truth.
- The concrete implementation remains narrower than a shared Motion or
  graphics framework.

MR7 stops here for GPT Architecture Lead Implementation Architecture Review.
