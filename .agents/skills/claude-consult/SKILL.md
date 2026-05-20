---
name: claude-consult
description: Consult Claude Code as an external second opinion for complex or risky software development work. Use when Codex is handling cross-layer features, architecture or API tradeoffs, difficult bugs, broad refactors, unclear test strategy, high-blast-radius changes, or when local code evidence conflicts with the planned approach. Do not use for simple text edits, small single-file fixes, mechanical renames, formatting-only work, or tasks with an obvious low-risk implementation.
---

# Claude Consult

## Purpose

Use Claude Code to pressure-test Codex's plan, risk assessment, and test strategy. Claude provides advice only; Codex remains responsible for reading the codebase, choosing the implementation, editing files, and verifying results.

## Before Consulting

Do local discovery first:

- Read the relevant files, specs, errors, and tests.
- Identify the concrete decision, risk, or uncertainty that warrants a second opinion.
- Reduce context to the minimum needed for Claude to reason usefully.
- Prefer facts from the local repo over assumptions.

Skip the consultation if the question can be answered quickly by local search, docs already in the repo, or running a focused check.

## Command

Use the local Claude Code binary when available:

```bash
/Users/mabel/.local/bin/claude -p '<prompt>'
```

If that path is unavailable, fall back to:

```bash
claude -p '<prompt>'
```

Run Claude non-interactively with `-p/--print`. Do not start an interactive Claude session for this skill.

Prefer a quiet, non-streaming run with a generous timeout. Quiet periods can still happen while Claude is reasoning, waiting on tools, or preparing the final response. Do not treat temporary silence as failure by itself; judge failures by process exit, explicit errors, or a clear timeout that is long enough for the consultation's complexity.

Only add streaming or verbose flags when you explicitly need incremental output for debugging the consultation itself.

Use a generous command timeout. In Codex `shell_command`, set `timeout_ms` to at least `1800000` for ordinary consultations and up to `3600000` for complex architecture, debugging, or broad review questions. If the user has said long Claude Code thinking time is acceptable, prefer extending the timeout over killing the first run and compressing the prompt. Only retry with a smaller prompt after the process exits with an error or reaches the generous timeout.

Keep prompts self-contained. Claude does not receive Codex's full conversation, Codex's current plan, or the project overview unless Codex includes them in the prompt. Claude Code may discover local project instructions through its own defaults, but this skill must not rely on that for correctness.

Do not use `--continue`, `--resume`, or an existing `--session-id` by default. They can pull unrelated Claude history into the review. Each consultation round should be an independent `-p` call with the needed context included explicitly.

## Consultation Loop

Use up to 3 rounds by default.

Round 1 should ask for a broad but focused review of the intended approach. Include:

- The user goal and current task boundary.
- Relevant repository facts and file paths.
- Codex's current understanding of the implementation options.
- The tentative approach and why it seems correct.
- Specific risks, edge cases, or tests Claude should scrutinize.

Use follow-up rounds only when they add value:

- Claude identifies a new credible risk.
- Claude disagrees with Codex's plan and the disagreement is not resolved by local evidence.
- Claude's answer is too vague to implement or verify.
- The test strategy still has an important gap.

Each follow-up should focus on one concrete unresolved risk or disagreement. Include the relevant summary of Claude's previous answer plus any new local evidence, because follow-ups are fresh non-interactive calls by default. Do not continue for general brainstorming once the advice has stopped changing the implementation decision.

If 3 rounds do not resolve the issue, stop consulting. Summarize the remaining uncertainty and choose the most conservative implementation path that can be verified locally.

## Prompt Template

```text
You are Claude Code acting as a second-opinion reviewer. Do not edit files.

Task:
<user goal and current task boundary>

Local facts:
<brief repo facts, relevant files, errors, tests, constraints>

Codex's current plan:
<tentative approach or options being considered>

Please review:
1. Is the plan technically sound given these facts?
2. What risks, edge cases, or hidden dependencies might Codex be missing?
3. What implementation adjustment, if any, would you recommend?
4. What focused tests or checks should verify the change?

Answer concisely. Separate must-fix issues from optional improvements.
```

Follow-up template:

```text
Follow-up on one unresolved point from your prior answer.

Unresolved point:
<specific risk, disagreement, or vague recommendation>

Additional local evidence:
<new code facts, test output, or reasoning Codex checked>

Question:
<one concrete question whose answer changes the implementation or tests>
```

## Integrating Advice

After consulting:

- Verify Claude's claims against local code, docs, or executable checks before relying on them.
- Adopt only advice that is consistent with local evidence and the user's constraints.
- Reject or defer advice that is speculative, out of scope, or would add unnecessary complexity.
- In the final implementation summary, mention the consultation only when it materially affected the approach, and state what changed.

Never let Claude's answer override repository truth, project instructions, user constraints, or required validation.
