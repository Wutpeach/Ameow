# Plan next low-risk Electron renderer command controller

## Goal

Plan the next lowest-risk Phase 5.2 Electron renderer command controller extraction after Phase 5.1 moved site-session command dispatch into `electron/siteSessionCommands.mts`.

This task is planning-only. It must not modify Electron business code, create a controller, change renderer commands, or enter implementation.

## Requirements

- Confirm the post-Phase-5.1 renderer command state in `electron/main.mts`.
- Map remaining renderer command/action families and classify their extraction risk.
- Prefer low-coupling command families such as support-log, diagnostics, app-update, or file/path commands.
- Treat config commands cautiously because `save_config` has persistence, broadcast, and proxy side effects.
- Exclude WebSocket action routing, BrowserWindow creation, startup/lifecycle, capture windows, download queue, and video download command changes from Phase 5.2 planning.
- Recommend one minimal Phase 5.2 implementation target.
- Explain why the recommended target is safer than other candidates.
- Identify files likely involved in a later implementation.
- Identify characterization tests needed before or during implementation.
- Explain how a later implementation should preserve:
  - renderer command names
  - payload shape
  - return values
  - error text / command envelope
  - `electron/main.mts` as the composition root
  - no hidden controller global state
- Run `claude-consult` on the draft plan and record adopted, rejected, and follow-up guidance.

## Acceptance Criteria

- [ ] `git status` is clean at the beginning.
- [ ] Current Trellis task is none before creation.
- [ ] Parent task `05-25-architecture-boundary-refactor` exists.
- [ ] This child task is created under the parent with priority P2.
- [ ] `implement.jsonl` and `check.jsonl` contain relevant spec/research context.
- [ ] `task.py validate` passes.
- [ ] Planning reads the required code and test files without modifying business code.
- [ ] `design.md` records the post-Phase-5.1 command/action family map, risk matrix, recommended Phase 5.2 target, non-goals, file scope, test plan, compatibility strategy, and Claude review summary.
- [ ] Planning is written to this child task or parent task record.
- [ ] The planning task is archived through Trellis finish-work.
- [ ] Any Trellis record changes are committed separately as chore commits.

## Non-Goals

- Do not modify `electron/main.mts`.
- Do not create a controller.
- Do not modify renderer command names, payloads, return values, or error envelopes.
- Do not modify WebSocket actions or routing.
- Do not modify BrowserWindow creation, startup, capture-window, or app lifecycle code.
- Do not modify download queue or existing video download command controller behavior.
- Do not modify config save/proxy/broadcast behavior.
- Do not run auto-formatting that could create business diffs.
- Do not enter Phase 5.2 implementation.
