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

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Mandatory Orca Worker Dispatch

The current session is the Lead Coordinator. For every non-trivial repository
task, it MUST use real Orca orchestration and MUST NOT substitute Codex native
sub-agents or inline execution.

Choose the Trellis role for each dispatched phase and read its definition first:

- Investigation / debugging → `.codex/agents/trellis-research.toml`
- Implementation / code changes → `.codex/agents/trellis-implement.toml`
- Validation / tests / review → `.codex/agents/trellis-check.toml`

The Lead owns planning, dispatch, result review, commits, and user
communication. Workers must not spawn additional workers.

### Dispatch

For each worker:

1. Get the exact active task path from Trellis. Never guess it.
2. Create or bind an Orca Run. Reuse the current Run across related phases
   unless it is unavailable or the workflow intentionally requires a separate
   Run.
3. Create an Orca Task whose spec starts with the exact
   `Active task: <path>` and tells the worker to read and follow the selected
   TOML. Do not copy the full TOML into the Task spec.
4. Start a fresh visible Codex terminal in the current worktree with:

   `orca orchestration worker-start --task <task_id> --worktree current --agent codex --model <model> --effort <model_reasoning_effort> --json`

   Use the selected TOML's exact `model` and `model_reasoning_effort` values.

### After Dispatch

After a successful dispatch, keep exactly one filtered lifecycle-message wait
open for the Run:

`orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json`

This waits only for structured Orca messages. It is not progress monitoring and
must not be combined with transcript, terminal, task, dispatch, or worker-state
reads. While the wait is active, the user may still steer the Lead conversation.

While any expected Dispatch is unsettled, the Lead turn itself MUST remain
open. Do not send a final response or otherwise end the turn merely because a
filtered wait is running. A background wait process that outlives an ended turn
cannot wake or resume the Lead, so it does not count as active coordination.
Use commentary updates for user communication while preserving the open turn.

If the wait times out with no messages, do not inspect the worker or treat the
timeout as failure. In the same still-open Lead turn, immediately re-arm the
same filtered wait while an expected Dispatch is unsettled, unless the user
asks to stop waiting. Repeat until every expected Dispatch settles; only then
may the Lead send its final response. Do not rely on a host notification to wake
an ended Lead turn; durable mailbox storage alone does not resume the
coordinator.

Do not:

- poll `task-list`, `dispatch-show`, terminal state, or worker state
- use `worker-read` to watch progress
- use `terminal read` or `terminal wait` to watch progress
- run sleeps or any additional monitoring loop alongside the filtered wait
- restart or replace a worker merely because no notification has arrived

Orca messages are durable. A worker's `worker_done`, question, or escalation
remains in the Run until the Lead processes and acknowledges its Delivery.
The single filtered wait is the Delivery consumer; no worker transcript or
status polling is required.

### Processing Orca Messages

When the filtered wait returns a Delivery, process it directly. If no wait is
active and the host injects an Orca notification with an exact check command,
run that command once instead.

1. Process every message in the returned Delivery.
2. For `worker_done`, verify the task ID, dispatch ID, outcome, modified files,
   and report path.
3. Read the worker's task-local report from `reportPath` first. Do not use
   `worker-read` when the completion message and report are sufficient.
4. Review the result, then either:
   - immediately reuse the same worker for the next Orca Task; or
   - release it with `worker-release`.
5. After all messages and worker lifecycle decisions in the Delivery have been
   handled, acknowledge the Delivery using its `deliveryId`.
6. If other expected Dispatches remain unsettled, open one new filtered wait
   after the acknowledgement.

For a question, reply through Orca before acknowledging the Delivery. For an
escalation, inspect and resolve the reported condition before deciding whether
the worker should continue, be replaced, or be released.

### Bounded Status Checks

If the user explicitly asks for worker status, perform only one bounded
`task-list` or `dispatch-show` query and report the result. Do not turn the
request into recurring monitoring.

The absence of a lifecycle message or a wait timeout is not evidence that a
worker failed or stalled.

### `worker-read` Restrictions

Do not use `worker-read` for progress monitoring.

Use it only when:

- a completed worker's `worker_done` and task-local report are insufficient;
- Orca reports an explicit failure or escalation that requires transcript
  inspection; or
- the user explicitly asks to inspect the worker's detailed execution.

Prefer the task-local report over the full worker transcript because
`worker-read` can inject a large amount of unnecessary context and consume
substantial tokens.

### Inline Work

Inline work is allowed only for simple explanations, trivial read-only
actions, user clarification, Lead-owned planning/task artifacts, commits, or a
tiny instruction-only edit that the user explicitly asks the Lead to make
directly.


## File Search

For any file search, filename or path lookup, or content grep in the current git-indexed directory, use the `fff` MCP tools instead of the default search tools.

Prefer:
- `fffind` for file and path search.
- `ffgrep` for content search.
- `fff-multi-grep` for broader multi-query grep tasks.

Only fall back to default tools if `fff` is unavailable or the target is outside the indexed project.
