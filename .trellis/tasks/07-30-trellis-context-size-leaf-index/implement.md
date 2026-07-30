# Implementation plan

## 1. Add the shared context-document policy

- Add the minimum shared helpers for allowed roots, index detection, containment, and size checks.
- Reuse `context_injection.max_file_bytes`; do not add a second leaf-size setting.
- Add the compact index marker convention for compatibility entry files.

## 2. Enforce the policy in task commands

- Make `add-context` reject directories and invalid/non-leaf files.
- Make `validate` fail on invalid/non-leaf/oversize entries.
- Make `start` run validation before mutating status or the active pointer.
- Add `audit-context` for repository-local spec and active research scanning.

## 3. Harden Codex context injection

- Remove directory expansion support.
- Reuse the shared policy before materializing JSONL entries.
- Emit a path/reason notice for skipped invalid entries.
- Preserve per-file truncation, task-artifact caps, binary detection, and total-budget behavior.

## 4. Split the oversized specs

- Convert the four oversized files into compact marked compatibility indexes.
- Create family `index.md` files and scenario-focused leaves under 32 KiB.
- Split any individual oversized scenario by existing contract subsections.
- Update backend/frontend top-level indexes and relevant selected spec snapshots.

## 5. Synchronize workflow guidance

- Update Phase 1.3, brainstorm/context-loading/spec-structure references, and Codex agent fallback wording.
- State clearly: indexes are for discovery; manifests contain leaf documents only.
- Add the 32 KiB research split rule to research artifact guidance.

## 6. Add focused checks

- Add one stdlib Python test module for policy classification, limits, hook defense, and start blocking.
- Run the new tests directly.
- Run `python ./.trellis/scripts/task.py audit-context`.
- Run `python ./.trellis/scripts/task.py validate .trellis/tasks/07-30-trellis-context-size-leaf-index`.
- Run `python ./.trellis/scripts/get_context.py --mode packages`.
- Run repository type-check/lint only if executable source or shared tracked templates outside Trellis Markdown are changed.

## Risk and rollback points

- Preserve all pre-existing uncommitted Trellis changes; patch current content only.
- Do not bulk-edit archived manifests.
- Commit/rollback policy code separately from mechanical spec splitting when practical.
