# Plan Electron renderer command controller registry

## Goal

Evaluate whether Phase 5.3 should replace the repeated renderer command controller checks in `electron/main.mts` with a controller registry pattern, after Phase 5.1 extracted site-session commands and Phase 5.2 extracted support-log commands.

This is a planning-only task. It must not modify business code or start implementation.

## User Value

Keep `electron/main.mts` as the Electron composition root while reducing manual renderer command dispatch boilerplate in a way that preserves every renderer-facing command contract.

## Confirmed Facts

- Git status was clean before creating this task.
- Trellis current task was `(none)` before task creation.
- Parent task `05-25-architecture-boundary-refactor` exists and is linked as this task's parent.
- `handleCommand(...)` currently delegates to three extracted controller/bridge objects before falling through to its switch:
  - video download
  - site session
  - support log
- The three extracted command handlers share the same practical shape:
  - `supports(command: AmeowRendererCommand): boolean`
  - `invoke<TResult>(command: AmeowRendererCommand, payload?: Record<string, unknown>): Promise<TResult>`
- The controllers are created lazily by `electron/main.mts` getter functions and cached in module-level variables.
- Renderer command transport remains `ameow:command:invoke` through `electron/preload.mts` and `src/desktop/runtime.ts`.

## Requirements

- Produce a dispatch order map for current `handleCommand(...)`.
- Identify already controllerized command families:
  - video download
  - site session
  - support log
- Identify command families still handled by the `main.mts` switch.
- Decide whether a controller registry is worth doing now.
- If worth doing, define the smallest Phase 5.3 implementation.
- If not worth doing, recommend a lower-risk next target.
- Include Claude Code second-opinion review and record adopted, rejected, and follow-up advice.
- Persist the recommendation in Trellis task records and archive the planning task.

## Compatibility Constraints For Any Later Implementation

- Preserve dispatch order.
- Preserve renderer command names.
- Preserve payload formats and object identity expectations.
- Preserve return values.
- Preserve error identity pass-through.
- Preserve exact unknown command error text: `Unsupported Electron command: <command>`.
- Keep `electron/main.mts` as the composition root.
- Do not let controllers create hidden global state.
- Do not change WebSocket actions, error envelopes, startup flow, preload bridge, desktop bridge, or renderer command types.

## Out Of Scope

- Do not modify `electron/main.mts` in this planning task.
- Do not create a registry implementation in this planning task.
- Do not create a shared controller interface in business code in this planning task.
- Do not change renderer commands, WebSocket actions, IPC envelopes, preload bridge, desktop bridge, or startup flow.
- Do not run formatting that creates unrelated diffs.

## Acceptance Criteria

- [x] Initial git status was confirmed clean.
- [x] Initial Trellis current task was confirmed as none.
- [x] Parent task was confirmed and child task was created.
- [x] `implement.jsonl` and `check.jsonl` were curated.
- [x] `task.py validate` passes for this task.
- [x] Current `handleCommand(...)` dispatch order is documented.
- [x] Controllerized and non-controllerized command families are documented.
- [x] Registry recommendation and minimum implementation plan are documented.
- [x] Claude consult is completed and summarized.
- [ ] Planning task is archived after records are complete.
