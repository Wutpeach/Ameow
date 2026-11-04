<!-- TRELLIS:START -->
# mini-trellis

This project uses mini-trellis as a memory layer. Working knowledge lives under `.trellis/`:

- `.trellis/spec/` — durable contracts (short markdown; read `index.md` first)
- `.trellis/research/` — topic inbox (`<topic>.md`; `README.md` is not a topic)
- `.trellis/workspace/` — per-developer journals

Record a session with `/mini-trellis:remember` (Claude/OpenCode), `/mini-trellis-remember` (Pi), or `$mini-trellis-remember` (Codex). When earlier decisions or relevant project rules are needed, use `mini-trellis mem recall "<topic or path>"`; expand evidence with `mini-trellis mem read "<ref>"`. No search is required for unrelated work. Promote lasting boundaries into spec with `mini-trellis-update-spec`.

Record only confirmed decisions, reusable research findings, or the session/compact handoff. Skip ordinary turns and unconfirmed guesses. New installs write notes without an automatic git commit; use `mini-trellis doctor` to check host wiring and `mini-trellis refresh --dry-run` before refreshing assets.

Keep confirmed rules short and faithful. Unconfirmed scope, exceptions, and implementation choices stay open or are labeled as inference, not added to the contract.

For a confirmed update, follow this short order: read the existing topic; edit that file; read it back and check the new rule, limits, and negations; run `python3 ./.trellis/scripts/add_session.py --title "..." --summary "..." --topic <actual-topic-path>`; read the journal and check its topic link. Journal-only success is not topic success; report partial writes accurately. New notes follow the requested or discussion language; updates preserve the document language.

When recall excerpts already answer the question with source and qualifiers, cite them and stop. Expand only missing context; do not repeat a lookup or fall back to dialogue-only `search` merely to reconfirm sufficient evidence.

mini-trellis does not create or drive tasks.

Managed by mini-trellis. Edits outside this block are preserved.
<!-- TRELLIS:END -->

## Agent Collaboration

The Lead owns coordination, integration, validation, and the final report.

- Handle simple or tightly coupled work locally. Prefer a native Codex agent when an independent boundary adds value.
- Delegate multi-file investigation and architecture tracing to `researcher`; use `implementer` for clearly bounded changes and `reviewer` for independent review.
- `researcher` and `reviewer` must operate read-only; the reviewer reports findings and does not make fixes. Their role files declare the intended sandbox mode, but Codex 0.159.2 inherits the parent's runtime permissions. Do not claim that per-role isolation is enforced without verifying it.
- When an independent review is actually requested and stronger read-only isolation is required, Cindy's local `/review` may be used as a temporary fallback if its read-only restrictions and review scope are confirmed. It does not replace Linear Review or user acceptance and is not started automatically.
- Use a Cindy Worker when a separate provider or a persistent multi-turn independent session is useful. Do not assign a native agent and Worker the same scope by default.
- Orca is optional. Do not require a Trellis Task, Orca dispatch, or a fixed Research → Implement → Review sequence.
- The Lead supplies the approved scope and relevant context, protects existing changes, integrates results, and verifies completion.

## Current project

Repository: `Wutpeach/Ameow`. Current product: Ameow, Rust / GPUI at the repository root; Windows x64/MSVC is the verified target. GitHub Issues carry current authorization; historical Linear records are reference only.

Use the shared `development-workflow` Skill for repository development and GitHub collaboration. Read `.trellis/spec/index.md` first, then only relevant contracts. Read `.trellis/spec/legacy-path-compatibility.md` before legacy cleanup. Do not run `mini-trellis migrate` or relocate legacy `.trellis/tasks/`.

Use the narrowest observable-behavior test. Bug fixes need a regression at the lowest useful layer. UI changes require running the affected native workflow; builds and unit tests alone are not UI proof. Reuse existing accepted evidence when the changed behavior is outside its scope. Do not overwrite accepted EXEs or historical evidence during validation.

When adding, changing, or removing a user-visible UI state, assess and update the corresponding preview scenes as needed. Unrelated development does not require running the full scene catalog, and ordinary scene maintenance does not need a separate Issue.

## File Search

For any file search, filename or path lookup, or content grep in the current git-indexed directory, use the `fff` MCP tools instead of the default search tools.

Prefer:
- `fffind` for file and path search.
- `ffgrep` for content search.
- `fff-multi-grep` for broader multi-query grep tasks.

Only fall back to default tools if `fff` is unavailable or the target is outside the indexed project.
