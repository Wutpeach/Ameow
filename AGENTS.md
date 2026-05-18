<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

## Subagents

- ALWAYS wait for every spawned subagent to reach a terminal status before yielding, acting on partial results, or spawning followups.
  - On Codex, this means calling the `wait` tool with the subagent's thread id (requires `multi_agent_v2`). Do NOT infer completion from elapsed time.
  - On Claude Code / OpenCode, this means awaiting the Task/agent tool result before continuing.
- NEVER cancel or re-spawn a subagent that hasn't finished. If a subagent appears stuck, raise the wait timeout (Codex default 30s, max 1h) before judging it broken.
- Spawn subagents automatically when:
  - Parallelizable work (e.g., install + verify, npm test + typecheck, multiple tasks from plan)
  - Long-running or blocking tasks where a worker can run independently
  - Isolation for risky changes or checks

### Codex-only — `spawn_agent` parameters

When calling `spawn_agent`, ALWAYS pass `fork_turns="none"`. Without it the child inherits the parent transcript and sees your prior `spawn_agent(...)` records, then applies the "wait for spawned subagents" rule to itself — causing `wait_agent` self-deadlock.

```text
spawn_agent(agent_type="trellis-implement", message="...", fork_turns="none")
```

### Codex-only — multi-subagent close-loop

When `wait` returns a `completed` notification, treat it as an event signal — not as "all done". Run this loop:

1. Maintain an `expected_agents` set of dispatched sub-agent thread IDs.
2. After each `wait` update:
   1. Call `list_agents` to inspect ALL live agents' status.
   2. For each agent now in a terminal state:
      - Verify its promised deliverable exists (e.g. `{task_dir}/research/*.md`).
      - Read or summarize as needed.
      - `close_agent` to release the slot.
      - Remove from `expected_agents`.
   3. If `expected_agents` still contains running agents → keep waiting.
   4. If `expected_agents` is empty → continue main flow.
3. Never `wait` on an agent that has already reported `completed`.
4. If a `completed` agent is missing its deliverable, treat it as failed — surface that in your report instead of re-waiting.

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Project Conventions

### Version Bumps

- When updating the app version, do not manually search and edit version strings across the repo.
- Always use `npm run version:set -- <version>`.
- This command is the single entry point for updating:
  - `package.json`
  - `package-lock.json`
  - `src-tauri/tauri.conf.json`
  - `browser-extension/manifest.json`
  - `src-tauri/Cargo.toml`
  - `src/constants/appVersion.ts`
- UI version displays should read from `src/constants/appVersion.ts` instead of hardcoded literals.

### Release Tags And Notes

- When preparing a tagged release, create and commit `release-notes/v<version>.md` before pushing the tag.
- Use `release-notes/TEMPLATE.md` as the starting point.
- Release notes should be written in Chinese by default.
- Release notes should summarize user-facing changes in plain language instead of dumping commit subjects.
- Keep a `Full Changelog` compare link at the bottom of the release note.
- The GitHub release workflow expects the versioned release-note file to exist in the tagged commit; missing notes should block the release.


### macOS Fix PR Policy

- For macOS adaptation or bug-fix tasks, Codex may automatically create a branch, commit changes, push to `origin`, and open a draft PR when the user explicitly asks for that workflow in the current session.
- Before auto-opening the PR, Codex must ensure `npm run type-check` and `npm run lint` pass, plus any task-relevant tests that were changed or added.
- Default base branch is `main`.
- Default branch naming should use a `mac/` or `fix/` prefix with a short slug.
- Default commit and PR titles should use the `fix(mac): ...` convention when the change is primarily macOS-specific.
- Auto-PRs should avoid bundling unrelated local binary/runtime artifacts unless the user explicitly requests them.


### File Search

For any file search, filename or path lookup, or content grep in the current git-indexed directory, use the `fff` MCP tools instead of the default search tools.

Prefer:
- `fffind` for file and path search.
- `ffgrep` for content search.
- `fff-multi-grep` for broader multi-query grep tasks.

Only fall back to default tools if `fff` is unavailable or the target is outside the indexed project.
