# Research: active local branch audit

- Query: Audit `feat/compact-mascot-depth-occlusion`, `chore/trellis-tooling-0.6.15`, and `repair/diagnostics-readability-export-cleanup` against durable Trellis artifacts; determine whether each branch has fullscreen work to integrate, what must be retained, what validation/commit/push work remains, and the safest local deletion disposition.
- Scope: internal repository only (active/archived Trellis tasks, reports, specs, journals, current fullscreen inventory, and current worktree-risk records). FFF indexed lookup was used for path/content discovery; known artifacts were read directly. No branch/ref/worktree mutation or Git operation was performed by this audit.
- Date: 2026-09-09 (Asia/Shanghai)

## Executive result

| Local ref (tip from inventory) | Durable owner/state | Fullscreen relevance | Verdict |
| --- | --- | --- | --- |
| `refs/heads/feat/compact-mascot-depth-occlusion` @ `b9a00ab93f15bbaf301e2b129406b0b5f16c69fb` | Mabel-WIN; the related `09-07-compact-mascot-bible-strong-cat-refinement` task is still `in_progress` with no commit | No unique fullscreen paths. It is active Compact mascot/depth-occlusion work; the depth experiment was explicitly abandoned and archived. | **retain/block** until the owner closes or explicitly archives the still-open task, current dirty Compact work is committed/reconciled, and the concurrent push is finished. |
| `refs/heads/chore/trellis-tooling-0.6.15` @ `40d31d38c4e140f389bbb1ba066b58fba3e43a91` | Mabel-WIN; archived task is `completed`, with work commit `0a93d51e4b4d534afe91ffa011ecb22cc7324bcb` | No unique fullscreen or Product work. A tooling-only 31-path synchronization is already archived; 0.6.16 tooling was later recorded on `main`. | **archive tag then delete**, after Lead verifies the full tip is either reachable/superseded and no active worktree or task owns it. |
| `refs/heads/repair/diagnostics-readability-export-cleanup` @ `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` | Mabel-WIN; root planning record is archived, but the linked worktree task remains `in_progress` and has no commit field | No unique fullscreen paths. Diagnostics implementation is a patch-equivalent duplicate; canonical Product truth is `b9ba0278d9f49d1831f5acbf813448072f53178b` on the accepted Product lineage. | **archive tag then delete**, only after task/worktree status is reconciled to the canonical pointer, the duplicate is proven non-unique, and the linked worktree is released. |

These verdicts intentionally differ from the conservative “retain” rows in
`research/fullscreen-branch-inventory.md:60-65`: that table was written before
the local-only cleanup decision. “Archive tag then delete” below means preserve
the exact branch tip and reports first, then perform a targeted branch deletion
only after the read-only checks listed here pass. It does not authorize any
mutation during this research phase.

## Shared evidence and deletion gate

The current inventory records `main` at
`ff53f9749aa095c69f8a84d6537838d46ce3037c`, an intentionally dirty worktree,
and another Codex window writing/pushing it
(`research/fullscreen-branch-inventory.md:5-7`). The inventory found nine local
heads and three remote-tracking refs; the complete relevant tip/hash matrix is
at `research/fullscreen-branch-inventory.md:45-69`. It also records that the
accepted Thermal/MR9/Lab chain (`48987f7` -> `c762c143` -> `e01be015` ->
`046f228c` -> `0e24a7a`) is already in `main` and that no fullscreen Product
implementation is missing (`:9-27`). None of the three audited branches is a
candidate source for that chain.

Before any branch deletion, the Lead should wait for the concurrent Codex push,
record the new `main` tip and dirty-path snapshot, and repeat read-only checks
against the exact branch tips. The current dirty Product paths include
`PresentationLab.tsx`, `lab-main.tsx`, both Lab locales, `rendererReuse.test.ts`,
`scenarios.ts`/test, and Compact files
(`research/fullscreen-branch-inventory.md:220-256`), with more than 38,000
untracked generated/runtime lines outside scope (`:258-260`). No cleanup,
staging, reset, stash, checkout, merge, cherry-pick, commit, or push is safe
while that window owns the worktree.

Minimum Lead-owned read-only plumbing after the push:

```text
git show-ref --verify refs/heads/<branch>
git log --oneline --decorate main..<branch>
git diff --name-status main...<branch>
git merge-base --is-ancestor <tip> main
git branch --contains <tip>
git worktree list --porcelain
```

For a branch with an attached worktree, the task status, worktree cleanliness,
and active process/window ownership must be resolved before releasing it. A
branch name alone is never proof that its work is disposable.

## 1. `feat/compact-mascot-depth-occlusion`

### Purpose, owner, and task state

The ref inventory identifies the tip as
`b9a00ab93f15bbaf301e2b129406b0b5f16c69fb`, dated 2026-09-07, with no unique
`src/lab` or `src/presentation/main-window` fullscreen paths; it is labeled
Compact mascot work (`research/fullscreen-branch-inventory.md:52-65`). The
related active task is
`.trellis/tasks/09-07-compact-mascot-bible-strong-cat-refinement/task.json`:
creator/assignee `Mabel-WIN`, status `in_progress`, `branch: main`, no commit or
worktree path, and a 2026-09-08 replan note
(`task.json:5-28`). The `branch: main` field does not prove that the separate
local `feat/...` ref is merged; it is a material identity mismatch that the
Lead must resolve from read-only ref ancestry before deleting anything.

### What is and is not in current `main`

The active task's implementation report says the final ear geometry and
OneWorks cleanup gates are **not accepted**; canonical diamonds were restored,
only a Lab frozen-pose seam was retained, and production keeps its prior
runtime/lifecycle path (`.trellis/tasks/09-07-compact-mascot-bible-strong-cat-refinement/artifacts/implementation-report.md:3-7`).
The report explicitly says the OneWorks inspector/dependencies remain active
and cleanup is unsupported until the visual gate passes (`:28-30`), while its
latest focused verification passed but did not clear final geometry, native
holder, or removal gates (`:48-69`).

The same task's `final-stop-check.md` records a successful **stop state**, not
feature acceptance: C6 rounded-cone/depth work failed, the PRD's final
cat-readability, production-holder, bounded-yaw/pitch, and OneWorks-removal
criteria remain unmet (`final-stop-check.md:5-15`). The failed depth-fragment
experiment is deliberately historical only and must not be applied
(`historical-experiments/depth-occlusion-2026-09-08/README.md:3-20`); its
patch is preserved with SHA-256
`B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D`
(`task.json:25-28`, `artifacts/implementation-report.md:32-38`).

The accepted follow-up behind-head composition task is already archived under
`.trellis/research/archive/2026-09/09-09-compact-mascot-ear-root-integration`.
Its implementation report says the shared Production/Lab seam now flattens
projected ear paths into the behind-head layer, with no avatar-core geometry or
renderer change; the accompanying journal records commits `fc0ba3c` and
`0fe50b6` on `main`. This is the accepted Compact composition fix, not evidence
that the older depth-occlusion branch's rejected experiment should be merged.

Therefore:

- Accepted behind-head behavior and the retained frozen-pose seam are present
  in the current mainline task history.
- The branch's abandoned depth-aware upstream patch is **not** Product work and
  is already intentionally archived with a hash and visual evidence.
- No branch commit should be cherry-picked for fullscreen integration.

### Unique work and obligations

The unique material is Compact mascot work/evidence, not fullscreen: active
dirty Compact/Lab edits, the unaccepted 09-07 visual decision, and the rejected
depth experiment's recovery record. The owner still owes an explicit task
closure/archive decision, preservation of the historical patch/evidence, and a
separate commit/review of any current dirty paths. No PR URL or push obligation
is recorded in `task.json`; do not invent one.

### Verdict and required evidence before deletion

**Verdict: retain/block.** Do not delete this ref now. The task is active, its
metadata points at `main` rather than the local feature ref, and current dirty
Lab files overlap the exact paths a future fullscreen cleanup would edit. A
blind branch operation could discard unresolved mascot work or make the
concurrent Codex push race with the wrong tip.

Lead may revisit an archival deletion only after all of the following
read-only checks succeed and the owner closes/archives 09-07:

```text
git show-ref --verify refs/heads/feat/compact-mascot-depth-occlusion
git log --oneline --decorate main..b9a00ab93f15bbaf301e2b129406b0b5f16c69fb
git diff --name-status main...b9a00ab93f15bbaf301e2b129406b0b5f16c69fb
git merge-base --is-ancestor b9a00ab93f15bbaf301e2b129406b0b5f16c69fb main
git worktree list --porcelain
```

If the tip has unique Compact commits, preserve them in an explicit archival
tag and task report before any deletion. If the owner still considers the
branch active or the tip cannot be proven recoverable, keep the branch.

## 2. `chore/trellis-tooling-0.6.15`

### Purpose, owner, and task state

The inventory records tip
`40d31d38c4e140f389bbb1ba066b58fba3e43a91`, dated 2026-08-24, with no unique
fullscreen paths (`research/fullscreen-branch-inventory.md:60-62`). The archived
task `.trellis/tasks/archive/2026-08/08-24-trellis-0-6-15-tooling-consolidation/task.json`
is `completed`, owned by `Mabel-WIN`, and records work commit
`0a93d51e4b4d534afe91ffa011ecb22cc7324bcb` (`task.json:5-18`).

The task PRD states that this was a tooling-only synchronization across exactly
31 approved `.trellis`, `.agents`, `.codex`, and `AGENTS.md` paths; its bounded
JSONL/context-policy repairs and template-manifest cleanup passed focused,
AST/import, JSON/TOML, task CLI/context, manifest, allowlist, and scoped diff
checks (`.trellis/tasks/archive/2026-08/08-24-trellis-0-6-15-tooling-consolidation/prd.md:5-19`).
It explicitly excludes Product/source/package/runtime changes and all
M3/Paper/Ripple/Diagnostics evidence (`prd.md:21-27`). The Mabel-WIN journal
records the same branch, commit, focused tests, completed status, and “No
Product work started” (`.trellis/workspace/Mabel-WIN/journal-6.md:10-41`).

### Mainline coverage, unique work, and obligations

Durable journal history later records a 0.6.16 Trellis tooling synchronization
on `main` (`9cdcb71` in Session 259, `.trellis/workspace/Mabel-WIN/journal-6.md`
after the 0.6.15 entry). This suggests 0.6.15 is superseded in active main,
but it is not an ancestry proof: the branch tip `40d31d38...` may include
archive/journal bookkeeping after `0a93d51`. The exact branch-tip path set and
ancestry still require Lead plumbing.

The unique work is the historical 0.6.15 tooling checkpoint and its exact
31-path boundary. It is already intentionally archived under the task path;
there is no Product or fullscreen dependency to integrate and no open PR/push
obligation in the task metadata. Preserve the full tip anyway, because the
archived task records the work commit but not the later tip hash.

### Verdict and required evidence before deletion

**Verdict: archive tag then delete.** This is the cleanest candidate for local
branch reduction, but deletion is conditional on proof rather than the branch
name or the completed task status.

Lead should first run:

```text
git show-ref --verify refs/heads/chore/trellis-tooling-0.6.15
git log --oneline --decorate main..40d31d38c4e140f389bbb1ba066b58fba3e43a91
git diff --name-status main...40d31d38c4e140f389bbb1ba066b58fba3e43a91
git merge-base --is-ancestor 40d31d38c4e140f389bbb1ba066b58fba3e43a91 main
git worktree list --porcelain
```

The expected safe outcome is no Product/fullscreen paths and no active
worktree/task. Before `git branch -d`, create an annotated archival tag at the
full tip (for example
`archive/chore-trellis-tooling-0.6.15-40d31d38`) and record that tag beside
`0a93d51e4b4d534afe91ffa011ecb22cc7324bcb` in the Lead's cleanup evidence.
If the tip is not an ancestor of `main`, the tag still preserves the complete
historical line; do not merge tooling into the fullscreen change merely to
make branch deletion pass. If a unique active tooling obligation appears,
change the disposition to retain/block.

The concurrent Codex push is a ref-race risk even though file ownership is
mostly disjoint: rerun ancestry and tip checks after the push, and never delete
the branch while a Codex process has it checked out or is writing its history.

## 3. `repair/diagnostics-readability-export-cleanup`

### Purpose, owner, and task state

The inventory records tip
`353a7984174a3d3d6e56a7944b7cb33b1ce5707f`, dated 2026-08-18, as diagnostics-only
and unrelated to fullscreen (`research/fullscreen-branch-inventory.md:60-65`).
The linked worktree task file
`.cindy-worktrees/diagnostics-readability-export-cleanup/.trellis/tasks/08-18-diagnostics-readability-export-cleanup-planning/task.json`
still says `status: in_progress`, `scope: implementation`, creator/assignee
`Mabel-WIN`, branch `repair/...`, worktree path
`D:/Ameow/.cindy-worktrees/diagnostics-readability-export-cleanup`, and
`commit: null` (`task.json:5-24`). This is the immediate deletion blocker.

The root archived task's implementation report describes a complete validated
repair from `main@5619ba0`, including typed-facts-first Quick Copy v2,
allowlist-first Support Export v2, the shared pre-egress sanitizer, and
Windows Electron validation; it records focused suites, type-check, lint,
build, docs build, and the known single pre-existing full-suite failure
(`.trellis/research/archive/2026-08/08-18-diagnostics-readability-export-cleanup-planning/research/implementation-report.md:5-8,31-58`).
The report says no Architecture PASS was granted on that branch
(`:5-8`), while the durable closure explicitly resolves the implementation
line as a duplicate: canonical Product Diagnostics truth is
`b9ba0278d9f49d1831f5acbf813448072f53178b`, inherited by immutable
`motion/compact-mascot-visual@2bb9a221708c211bdec8721e02d0e469de44ef89`; the
repair tip `353a798...` is recoverable patch-equivalent evidence only, with
stable patch ID `e1f4967ec5a9f1ca8a60ec0a1d8e5dfc7f6a3264`, and is not
reintegrated (`closure-report.md:1-8`).

The current logging spec also documents the resulting canonical v2 boundary,
including final sanitization immediately before clipboard/file egress and the
four support-export sections (`.trellis/spec/backend/logging-guidelines.md:55-99`).
This is durable evidence that the intended diagnostics behavior belongs to the
main Product lineage, not that the duplicate branch should be merged again.

### Mainline coverage, unique work, and obligations

The canonical implementation is already represented by `b9ba027...` on the
accepted Product lineage and in the current main-era task/spec history; the
duplicate branch's 25-path implementation (the closure record reports a stable
patch-equivalent identity) must not be replayed. Its unique value is recovery
evidence: the full tip, stable patch ID, implementation report, Windows test
record, and explicit macOS/runtime/deferred-debt notes.

There is an administrative contradiction to resolve before deletion: the root
task is archived and the closure says the duplicate is not reintegrated, but
the linked worktree task remains `in_progress` with no commit. The Lead must
close/align that worktree task against the canonical `b9ba027...` pointer,
confirm the worktree is clean and not being used by an active process, and
preserve the duplicate report/tag. No PR URL or remote push obligation is
recorded; this audit does not authorize remote deletion or a new diagnostics
implementation.

### Verdict and required evidence before deletion

**Verdict: archive tag then delete**, after administrative reconciliation. The
branch is not an integration prerequisite, but it cannot be deleted while its
linked task claims active implementation ownership.

Lead should run the following read-only checks after the concurrent main push:

```text
git show-ref --verify refs/heads/repair/diagnostics-readability-export-cleanup
git log --oneline --decorate main..353a7984174a3d3d6e56a7944b7cb33b1ce5707f
git diff --name-status main...353a7984174a3d3d6e56a7944b7cb33b1ce5707f
git merge-base --is-ancestor b9ba0278d9f49d1831f5acbf813448072f53178b main
git diff --stat b9ba0278d9f49d1831f5acbf813448072f53178b 353a7984174a3d3d6e56a7944b7cb33b1ce5707f
git worktree list --porcelain
```

The expected outcome is that `b9ba027...` is reachable from current `main`,
`353a798...` contains no unreviewed Product behavior that is absent from the
canonical pointer, and the linked worktree can be released. Before a targeted
`git branch -d`, create an annotated archival tag at the exact duplicate tip
(for example `archive/diagnostics-readability-export-cleanup-353a7984`) and
retain the closure/implementation reports and patch ID. If the task owner
cannot reconcile the active worktree record or the diff reveals unique
required work, switch to retain/block rather than deleting or cherry-picking.

## Concurrent Codex window and final local-only outcome

The current fullscreen task explicitly says to preserve dirty Compact/Lab paths
and avoid interference with the concurrent push
(`research/fullscreen-branch-inventory.md:20-22,220-260`). The three audited
branches have no missing accepted fullscreen renderer, so branch cleanup must
not be used as a shortcut for Lab integration. The safe eventual sequence is:

1. Wait for the other Codex window to finish its `main` push; snapshot the new
   `main` tip and dirty paths without staging or rewriting anything.
2. Resolve the Compact task's active ownership first; keep
   `feat/compact-mascot-depth-occlusion` blocked unless its owner closes it.
3. For tooling and diagnostics, complete the per-branch ancestry/path/task/
   worktree checks above, create recovery tags, and release any linked
   worktrees.
4. Delete only proven local branches with `git branch -d`; never use `-D`, and
   do not touch `origin/main`, `origin/HEAD`, or any remote ref in this local
   cleanup. Re-run `git branch --format='%(refname:short)'` and require only
   `main` (tags do not appear in that branch listing).

## Caveats / Not Found

- This audit did not run Git plumbing itself, so current ancestry/merge-base,
  exact branch-only path sets, linked-worktree locks, and post-push tips remain
  Lead-owned evidence requirements. The inventory's hashes are the durable
  snapshot for this turn, not a substitute for rechecking after the push.
- No current remote-tracking ref proves that either audited local branch has a
  server counterpart; do not infer remote deletion permission. The inventory
  says origin refs are stale and fetch was forbidden
  (`research/fullscreen-branch-inventory.md:327-334`).
- The Compact 09-07 task's failed depth patch and C6 captures remain valuable
  recovery evidence even though the branch itself is blocked; deleting or
  rewriting those task files would violate their explicit historical-only
  boundary.
- The diagnostics branch's old implementation report says “awaiting GPT
  Architecture Lead Architecture Review,” while its closure and later journal
  identify `b9ba027...` as the Architecture-PASS canonical Product checkpoint.
  This is why task/worktree status reconciliation is a prerequisite to branch
  deletion rather than an assumption of immediate safety.
