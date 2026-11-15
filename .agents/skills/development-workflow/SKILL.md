---
name: development-workflow
description: >-
  Shared, on-demand guidance for software development in any repository:
  repository-grounded investigation, implementation, verification,
  GitHub Issue collaboration, handoffs, and durable project knowledge.
  Use when working on a development task or an explicitly requested
  task-management action. Not for routine chat, general Q&A, or product
  brainstorming with no requested development action.
---

# Development workflow

## Scope and authorization

- **Project-agnostic:** Identify the current repository, task, and applicable project instructions from actual context. Never assume a fixed repository list, owner, GitHub Project, task ID, or previously granted approval. Do not transfer decisions or authorization between projects.
- This Skill describes *how* to collaborate; it grants no permission to create tasks, change shared state, modify code, incur costs, or close Issues. Follow the user's current request and authorization. Reading an Issue or seeing a Project status is not permission to begin work.
- Respect the repository's `AGENTS.md` and other applicable local rules. Do not duplicate or replace the repository's tool, testing, or managed knowledge instructions here. Load only context relevant to the task.
- Ground implementation claims in code, diffs, tests, and runtime evidence. Plans and agent reports are not proof that a change works.

## Discussion and durable task records

- Requirements, design, repairs, and acceptance can be discussed in any authorized agent session. A discussion does not itself require a GitHub write or start implementation. No agent or harness has exclusive ownership of publishing or review.
- If the project tracks work in GitHub, the relevant **repository Issue** is the durable record for the task goal, approved scope, key decisions, meaningful results, blockers, and cross-session handoffs. A GitHub Project, if used, is a planning view; identify its actual scope rather than assuming one Project or one Project per repository.
- Do not create an Issue for every experiment, chat, or small fix. Reuse an existing relevant Issue when suitable; create one for a distinct tracked deliverable only when warranted and authorized. Do not add unrelated or third-party Issues to a user's planning view without approval.
- Use whichever capable GitHub integration is available. Do not couple the workflow to a specific MCP, plugin, or agent platform.

## Publishing and executing work

- When authorized to **publish** a plan, write concise, self-contained task requirements to the appropriate Issue body or comment: objective, relevant scope and exclusions, essential constraints, acceptance expectations, and necessary references. Leave implementation exploration to the development agent within the approved boundaries.
- If a new direction supersedes an earlier one, say what changed and what is no longer applicable; preserve useful history. No mandatory rounds, formal Instruction/Report/Review comment types, handoff headers, or active-comment pointers.
- Confirm important writes succeeded. After publishing, give a short start message pointing to the actual Issue or comment URL. Publishing alone does not start development.
- Before **executing** an Issue-based task, check the repository, the currently applicable request, relevant later changes, and whether the task is already done or superseded. Read only the necessary context; the latest comment is not automatically the approved instruction.
- Within approved scope, investigate, implement, delegate, test, and perform small repairs without requesting approval for every step. Reuse the existing executor and context when sensible. Seek approval before significant scope or architecture changes, paid operations, new external side effects, or actions beyond granted permissions.
- Short repair prompts in the ongoing chat are fine when context remains intact; write the important outcome to the Issue at the next meaningful handoff if the task is tracked there.

## Reporting, review, and status

- At meaningful completion, a blocker, or an agreed stopping point, briefly report factual results. For Issue-tracked work, post the handoff to the **same Issue**, unless the user explicitly requests another location. Use the language requested by the user; otherwise follow established project conventions.
- Include what changed; branch/commit or clearly identified uncommitted work; checks actually run and their results; useful evidence; remaining risks and decisions needed. Never invent tests, imply verification that did not happen, or commit solely to fill a report field.
- Review the original goal and observable behavior, not merely an implementer's summary. Distinguish reported claims, independently verified evidence, and unknowns. Local development checks do not automatically constitute final product acceptance.
- Checking progress or reviewing a report is read-only unless a write or follow-up action is authorized. Review does not automatically authorize new development, next-task selection, or closing the Issue.
- When permitted, keep Issue state and Project status aligned with actual progress using available tools. They are separate mechanisms; avoid redundant status bookkeeping. Do not close an Issue or start unrelated work without the necessary authorization.
- For a cross-session handoff, preserve only the essential decisions, unresolved questions, evidence links, and next action; do not copy the full conversation. Save a dedicated checkpoint only when requested or genuinely necessary.
- On failed/rate-limited writes, identify unsynced content and check whether a prior attempt succeeded before retrying. Never repeat implementation, tests, or paid external actions merely to resend a report. Do not publish secrets or sensitive local data in public Issues.

## Project knowledge and existing data

- Follow the repository's actual knowledge structure; do not assume every project uses the same memory layer. Load only applicable contracts and research. Update durable knowledge for confirmed reusable decisions, constraints, or lessons—not for routine chat or unconfirmed inferences.
- **In Ameow**, start from `openspec/README.md` and read only the relevant capability specs. OpenSpec is the only active formal Spec record/update system. Use the generated OpenSpec Skills for authorized behavior changes and follow `docs/spec-maintenance.md`; do not turn historical rounds into new changes. Design notes, research and engineering guides are references, not parallel Spec stores.
- **Ameow historical sources:** the external migration and docs backups were removed at the user's request. `docs/spec-migration/README.md` retains provenance and source-availability limits, not a live backup entry. Use Git for committed history and Cindy for session recall; do not assume a recovery copy for untracked/ignored history or restore the retired integration. Preserve accepted evidence that still exists. GitHub Issues/Projects/PR remain task/delivery records; do not create a replacement task ledger in OpenSpec.
- For historical sessions, use Cindy native history and preserve source/coverage limits; do not invoke the retired knowledge CLI or journal scripts. Follow the active harness's delegation settings; specialized workers and native agent roles are tools to use when useful, never mandatory development phases. The lead executor remains responsible for integration, and a role labeled read-only does not by itself prove hard sandbox isolation.
