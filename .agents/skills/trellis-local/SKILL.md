---
name: trellis-local
description: |
  Project-specific Trellis customizations for FlowSelect. Use this skill to understand local Codex/Trellis workflow changes that differ from vanilla trellis-meta.
---

# Trellis Local - FlowSelect

## Base Information

| Field | Value |
| --- | --- |
| Trellis Version | 0.5.7 |
| Date Initialized | 2026-03-16 |
| Last Updated | 2026-05-08 |

## Customizations Summary

- Added `codex-subagents` to orchestrate Codex in-session subagents after explicit user authorization
- Updated `start` to conditionally route into `codex-subagents` once a Trellis task is active
- Documented the same rule in `AGENTS.md` so the default session instructions stay repo-discoverable

## Skills / Commands

### Added

#### `codex-subagents` [Codex]

- File: `.agents/skills/codex-subagents/SKILL.md`
- Purpose: Use `explorer`, `default`, `reviewer`, and `awaiter` safely inside one Codex session
- Added: 2026-03-16
- Reason: Codex subagents are opt-in and need explicit dispatch, reuse, and conflict rules in this repo

### Modified

#### `start`

- File: `.agents/skills/start/SKILL.md`
- Change: Added conditional handoff to `codex-subagents` after task activation when the user explicitly authorizes subagents
- Date: 2026-03-16
- Reason: Make multi-agent usage discoverable from the default Trellis entrypoint without breaking the standard task workflow

## Workflow Changes

#### Codex subagent routing

- Files: `AGENTS.md`, `.agents/skills/start/SKILL.md`, `.agents/skills/codex-subagents/SKILL.md`
- Rule: `start` stays the default entrypoint; `codex-subagents` is the opt-in accelerator after explicit user permission and only for safe, non-overlapping subtasks
- Date: 2026-03-16

#### Trellis 0.5.7 alignment

- Files: `.trellis/config.yaml`, `.trellis/workflow.md`, `.trellis/scripts/common/*`
- Rule:
  - Project Trellis runtime/templates are now aligned to upstream `0.5.7`
  - Codex CLI feature flag naming follows upstream `features.hooks`
  - `finish-work` is the end-of-session wrapper in workflow docs; older `$record-session` references should be treated as stale local text until fully cleaned up
- Date: 2026-05-08

## Changelog

### 2026-03-16

- Initialized `trellis-local`
- Added `codex-subagents`
- Linked `start` to the new skill with an explicit-permission gate
- Documented the repo rule in `AGENTS.md`

### 2026-03-26

- Added manual Codex worktree preparation via `prepare.py`
- Added dependency-ordered child-branch merge via `merge.py`
- Updated `start.py` with `--prepare-only` for manual worktree startup
- This local worktree-helper customization was later retired and removed during the 2026-05-08 Trellis `0.5.7` cleanup

### 2026-05-08

- Upgraded project Trellis templates from `0.5.6` to `0.5.7`
- Updated local Trellis base-version record from stale `0.3.0` to `0.5.7`
- Documented that legacy `$record-session` wording in older local skill text is stale and should not be treated as the current workflow source of truth
- Removed the old local `multi_agent` worktree-helper residue and retired the corresponding local customization note
