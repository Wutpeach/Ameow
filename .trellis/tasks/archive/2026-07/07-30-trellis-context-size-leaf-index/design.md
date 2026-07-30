# Trellis context size and leaf-index design

## Boundaries

This is a project-local Trellis customization. It changes local task context policy, Codex injection behavior, workflow guidance, and the oversized project specs. It does not modify the global Trellis installation.

## Document model

- Index node: a file named `index.md`, or a compatibility entry carrying the agreed Trellis index marker.
- Leaf document: a regular `.md` file under `.trellis/spec/**` or the current task's `research/**` that is not an index node.
- Manifest entry: one leaf document with a reason. Directory entries are removed from the supported contract.
- Leaf size cap: 32768 bytes, matching the existing `context_injection.max_file_bytes` default.
- Index size target: 8192 bytes. Indexes are navigation metadata and are never auto-injected.

## Data flow

```text
planning selects a leaf
  -> task.py add-context validates policy
  -> task.py validate rechecks both manifests
  -> task.py start blocks unless validation passes
  -> Codex hook defensively rechecks entries
  -> only valid leaf content is inlined within the existing byte budget
```

## Shared policy

Keep path classification and size checks in one small Python policy surface under `.trellis/scripts/common/`. `task_context.py`, `task.py start`, the audit command, and the Codex hook should call the same functions instead of reproducing path rules.

The shared checks must resolve paths against the repository root and verify containment. This prevents `..` paths or symlinks from escaping the allowed spec/current-task research roots.

## Validation behavior

- `add-context`: fail before writing an invalid row.
- `validate`: count invalid scope, directory, index, extension, missing file, and oversize conditions as errors.
- `start`: run context validation before writing the active-task pointer or changing `planning` to `in_progress`.
- `audit-context`: scan `.trellis/spec/**/*.md` and non-archived `.trellis/tasks/*/research/**/*.md`, report index/leaf classification and size violations, and return nonzero on violations.
- Hook: skip invalid entries with a notice. Keep truncation for unexpected runtime races or configurations where validation was bypassed.

## Spec migration shape

Split the four oversized specs by their existing `## Scenario` boundaries. If one scenario still exceeds 32 KiB, divide it by its existing subsection contracts. Each family gets a compact `index.md`.

The previous large file path becomes a small marked compatibility index pointing at the new hierarchy. This preserves historical links while ensuring new manifests cannot treat the compatibility file as a leaf.

Affected families:

- backend Electron runtime contracts
- backend type-safety contracts
- backend sidecar runtime contracts
- frontend type-safety contracts

Update backend/frontend top-level indexes to point to the new family indexes. Review the selected tracked snapshots under `src/templates/markdown/spec/` and update only the snapshots whose executable guidance moved.

## Compatibility

- Archived task manifests remain untouched. Historical paths continue to exist through compatibility indexes, but rerunning an old task requires recuration to leaf entries under the new policy.
- Active tasks currently have no curated context entries, so no active manifest migration is required.
- The existing injection byte-budget configuration and notices remain compatible.

## Rollback

The policy and spec split are independent rollback points. If runtime validation causes an unexpected workflow break, revert the start/add-context enforcement while keeping compact spec files and hook byte caps. No data migration is destructive because old paths remain as compatibility indexes.
