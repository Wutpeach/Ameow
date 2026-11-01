# Research: Compact task status reconciliation

- Query: Reconcile the active `09-07-compact-mascot-bible-strong-cat-refinement` task with the archived `09-09-compact-mascot-ear-root-integration` task, current task evidence/journals/commits, and `feat/compact-mascot-depth-occlusion`; determine remaining Compact work and the safe branch-cleanup disposition.
- Scope: internal repository only (Trellis task records and reports, frontend specs, current Compact sources/diff, journals, read-only Git refs/worktrees/commits, and existing branch-cleanup plans). FFF `find_files`/`grep` was used first for indexed discovery; known files were then read directly. No product, spec, task metadata, ref, worktree, or historical evidence was changed.
- Date: 2026-09-09 (Asia/Shanghai)

## Findings

### Executive determination

1. **The 09-09 root-integration implementation is complete and archived, but it is not an Architecture PASS.** Its task record is `completed` with `completedAt: 2026-09-09` (`.trellis/tasks/archive/2026-09/09-09-compact-mascot-ear-root-integration/task.json:5-18`). The implementation is the smallest shared-seam change: `renderCompactMascotScene` keeps avatar-core projection/pose output, concatenates core `backPaths` and `frontPaths` into Compact `backPaths`, and emits empty Compact `frontPaths` (`src/presentation/main-window/compactMascotBehaviorRuntime.ts:34-53`; commit `1e99292472fa66fd404c73b7ffbd09f587cd5416`). The archive report records passing focused tests, type-check, lint, task validation, and visual/DOM evidence (`artifacts/implementation-report.md:5-52`), then explicitly says “No Architecture PASS” and leaves geometry refinement/OneWorks cleanup out of scope (`:54-57`; `artifacts/check-report.md:8-16,67-79`). The archive/bookkeeping commits are `0dcfdddea3073e8fca6523f6d9c09b36ef887ed6` and `f1b4991c58982fc5a896e61bf58840c2aeec9cfa`.

2. **Substantive Compact work remains only in the older 09-07 refinement scope, not in the completed 09-09 root-layer fix.** The 09-07 goal still asks for a cat-readable final geometry, reference-backed evidence, equivalent bible-strong Lab coverage, and conditional OneWorks cleanup (`.trellis/tasks/09-07-compact-mascot-bible-strong-cat-refinement/prd.md:7-17,21-58`). Every 09-07 acceptance checkbox remains unchecked (`prd.md:60-69`). The implementation report says final geometry and cleanup are not accepted, canonical diamonds were restored, and only a Lab frozen-pose seam was retained (`artifacts/implementation-report.md:3-7`); it keeps the OneWorks inspector/files/tests/dependencies because the zero-consumer gate is not justified (`:28-30`).

3. **The 09-07 `in_progress` record is intentional open/rejected-refinement scope, not merely stale residue.** Its metadata has `status: "in_progress"`, `completedAt: null`, `branch: "main"`, `commit: null`, and a 2026-09-08 replan note (`task.json:6,13-18,24-28`). The PRD header still says “Planning on `main`” (`prd.md:3-5`), which is a stale phase label to reconcile, but it does not make the unresolved scope disposable. The final stop check says the bounded stop condition succeeded but is explicitly “not feature acceptance”; cat-readability/root-integration, production-holder, bounded yaw/pitch, and OneWorks-removal criteria remain unmet (`artifacts/final-stop-check.md:5-15`). C6 was rejected because neutral tips were too small and `curious-short` exposed a whole-node side lobe (`:74-92`), while the task deliberately refused a new depth/mask/fragment mechanism (`:7-10,149-157`). This is a valid stopping point for an unresolved refinement decision, but it is not a completed 09-07 feature.

4. **The retained 09-07 implementation is partly committed and partly still dirty.** The runtime preview seam, regression tests, and character-motion contract landed in `1e992924`; the remaining host/Lab wiring is an uncommitted 12-file, 91-line diff (`CompactMascot.tsx`, `CompactPreviewStage.tsx`, `PresentationLab.tsx`, `lab-main.tsx`, both Lab locales, Compact/Lab scenario/reuse tests, and the archived-fixture read-path test). The live diff shows the canonical definition and definition test are clean (`git diff --quiet HEAD -- src/presentation/main-window/compactMascotDefinition.ts` and `.test.ts` both exit 0), while the frozen `previewPose` seam is present in `CompactMascot.tsx:91-109` and the Lab callers. The 09-07 report identifies this boundary as retained implementation (`artifacts/implementation-report.md:21-26,63-69`).

5. **The previous Compact Architecture PASS does not transfer to either current task.** The archived 2026-08-25 closeout grants Architecture Review PASS for the earlier unchanged two-diamond geometry and says no next-stage refinement was authorized (`.trellis/tasks/archive/2026-08/08-24-compact-mascot-ear-geometry-repair/architecture-review-closeout.md:1-12,38-52`). The 09-09 PRD explicitly excludes self-awarding Architecture PASS (`.trellis/tasks/archive/2026-09/09-09-compact-mascot-ear-root-integration/prd.md:33-46`), and its check report repeats that no Architecture PASS is awarded (`artifacts/check-report.md:8-16,79`). The current 09-07 reports likewise do not claim one.

6. **Historical evidence is complete and must remain immutable.** The abandoned depth-aware experiment is historical-only (`historical-experiments/depth-occlusion-2026-09-08/README.md:1-20`), and its patch hash is recorded in task metadata and reports as `B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D` (`09-07/task.json:25-28`; `artifacts/implementation-report.md:32-38`; `artifacts/final-stop-check.md:112-121`). The C6 captures remain labeled rejected (`final-stop-check.md:74-92`). The identified official `pig--pink-pig` snapshot is reference-only, with blob SHA `4dac35833dcf7be98d07e1d0f2c168cce52aba7e` at OneWorks revision `9792d24dcdadb13b960757f4352e3fc11bb11130`; the user’s original share/custom state remains unavailable (`artifacts/implementation-report.md:9-19`; `research/oneworks-pig-pink-pig-reference.md`).

### Current Compact and mainline state

- Mainline contains the accepted behind-head composition fix. The journal records session 260 as completed on `main`, with `fc0ba3c` for the workflow note and `0fe50b6` for the Compact fix (`.trellis/workspace/Mabel-WIN/journal-6.md:209-229`); the live commit equivalents are `1e992924` (source fix), `0dcfddde` (task archive), and `f1b4991c` (journal record). This is implementation completion for 09-09 only.
- The current canonical definition is still exactly two `diamond` nodes with `76 x 135 x 78` dimensions and the original mirrored positions/rotations (`src/presentation/main-window/compactMascotDefinition.ts:49-60`; `09-07/artifacts/final-stop-check.md:19-33`). The current runtime preserves one Compact-local rAF/deadline lifecycle and now assigns both projected ear partitions to the behind-head paint layer (`compactMascotBehaviorRuntime.ts:86-153`; `:34-53`).
- The current 09-07 task’s Lab-only seam is deterministic and bounded: `previewPose` renders neutral or retained action samples through the canonical definition/core path, subscribes only to Lab-local pointer values, and production omits the prop (`CompactMascot.tsx:91-125`; `09-07/artifacts/final-stop-check.md:51-72`). These tests/evidence prove the seam and current eye-attention behavior, not the missing cat geometry.
- The live working tree is intentionally dirty: `git status --short --branch` reports `main...origin/main`, 12 Compact/Lab paths matching the retained seam, three unrelated line-ending edits (`browser-extension/locales/contract.json`, `electron-builder.config.mjs`, `src/electron-runtime/runtimeDependencyGate.ts`), and untracked task/evidence/generated trees. No such path may be reset, cleaned, staged incidentally, or lost during branch cleanup.

### `feat/compact-mascot-depth-occlusion` reconciliation

Read-only live ref checks on 2026-09-09 show:

| Check | Result | Meaning |
| --- | --- | --- |
| `git show-ref --verify refs/heads/feat/compact-mascot-depth-occlusion` | `b9a00ab93f15bbaf301e2b129406b0b5f16c69fb` | Ref exists at the 2026-09-07 “archive 08-25 OneWorks adoption” bookkeeping commit. |
| `git worktree list --porcelain` | No `branch refs/heads/feat/compact-mascot-depth-occlusion` entry | The feature ref is not checked out in a worktree; current Compact edits are on `main`. |
| `git rev-list --left-right --count main...feat/compact-mascot-depth-occlusion` | `19 15` | The branch is a divergent historical line, not a fast-forward/ancestor of current `main`. |
| `git merge-base main feat/compact-mascot-depth-occlusion` | `678d5384666e15d216efac66527bacd0dc571633` | The branch diverged before the parallel bookkeeping sequence. |
| `git diff --stat main...feat/compact-mascot-depth-occlusion -- src/lab src/presentation/main-window` | 2 files, 2 insertions | Only `src/lab/OneWorksMascotInspector.test.ts` and `src/lab/OneWorksMascotInspector.tsx` differ (one `data-oneworks-pointer-adapter` marker each); no Compact renderer/definition/runtime or fullscreen path is unique to this ref. |

`git log main..feat/compact-mascot-depth-occlusion` contains 15 branch-only commits, all task/journal/tooling/OneWorks bookkeeping; it contains no 09-07 implementation commit and no 09-09/root-integration commit. Therefore **do not merge or cherry-pick this branch for fullscreen or Compact integration**. The local branch is a stale historical pointer in the naming sense, but it is not safe to delete while the owner’s 09-07 task remains `in_progress` and its retained Lab seam/evidence are still dirty and unresolved.

### Exact safe disposition for the cleanup plan

**Disposition now: retain/block `feat/compact-mascot-depth-occlusion`.** This is the safe default because:

- 09-07 is still an active owner-scoped task with no commit/completion metadata, even though its task record points to `main` rather than this feature ref (`09-07/task.json:6,14-18`).
- The branch is not a fullscreen dependency and has no unique Compact product code, so deletion cannot be justified as part of fullscreen integration.
- Current 09-07 Lab/host changes and untracked evidence must first be committed/reconciled or explicitly preserved as a recoverable patch. A branch deletion cannot preserve uncommitted files; the historical patch tag also would not preserve them.
- The current live ref set differs from the original inventory: `main` is now `f1b4991c58982fc5a896e61bf58840c2aeec9cfa` and `origin/main`/`origin/HEAD` point there, while an extra attached `Wutpeach/mr9-ripple-preview` branch also points at `818057f`. The old inventory’s `ff53f974...` tip and nine-head count must not be reused for destructive decisions.

After the concurrent push is quiescent and the 09-07 owner has made an explicit task decision, the conditional cleanup path is:

1. Snapshot current `main` dirty tracked/untracked paths outside the repository; finish or preserve the 09-07 retained Lab seam. If the refinement is still wanted, keep the task open or create a new scoped follow-up after recording the stop. If the owner is done with this bounded attempt, archive 09-07 with a closure that says “stopped/rejected refinement; acceptance not granted,” not “Architecture PASS” or “final geometry accepted.”
2. Re-run `git show-ref`, `git log main..<tip>`, `git diff --name-status main...<tip>`, `git merge-base --is-ancestor <tip> main`, and `git worktree list --porcelain` against the post-push refs. Confirm no worktree/process/task still owns the feature ref and that the dirty Compact data has a separate recovery record.
3. Create and verify an annotated local archive tag at the exact feature tip, for example `archive/branch/20260909-feat-compact-mascot-depth-occlusion-b9a00ab`; require `git rev-parse 'archive/branch/20260909-feat-compact-mascot-depth-occlusion-b9a00ab^{}'` to equal `b9a00ab93f15bbaf301e2b129406b0b5f16c69fb`. Keep the 09-07 task directory, C6 captures, and historical patch unchanged.
4. Only then, with explicit local-cleanup authorization, delete this named branch. Try ordinary `git branch -d feat/compact-mascot-depth-occlusion` first; because the live ancestry check is nonzero (`19/15` divergence), a forced `-D` is acceptable only after the tag, dirty-patch recovery, worktree release, and owner decision are independently verified. Never use a wildcard deletion, and never delete `main` or remote-tracking refs as part of this local step.
5. Re-list all local heads. The local-only-main invariant is not satisfied until the extra Ripple alias and every other non-main local head have their own evidence/tag/worktree decisions; the prior nine-head inventory is stale. Remote cleanup is separate and unauthorized without a fresh fetch and explicit user approval.

This disposition preserves the feature ref as a recovery pointer without pretending it contains the current Compact work. If the owner explicitly declares the pointer disposable after step 1, it may move from retain/block to tag-then-delete; no integration commit is required.

### Implementation / review / archive / history / future matrix

| Category | Determination | Safe interpretation |
| --- | --- | --- |
| Implementation completion | 09-09 root-layer behavior is implemented, tested, and in `main`; 09-07 visual refinement is not accepted. | Do not reopen 09-09 for cat-shape work; preserve/finish the 09-07 retained seam separately. |
| Architecture PASS | Only the earlier 08-24 two-diamond repair has a recorded PASS. Neither 09-07 nor 09-09 grants one. | Do not label current root fix or stop state as Architecture PASS. |
| Task archive | 09-09 is archived/completed. 09-07 is active/in-progress with `completedAt`/`commit` unset. | Archive 09-07 only as an explicitly stopped/rejected scope if the owner chooses; archiving is administrative and does not turn unmet criteria green. |
| Historical evidence | 09-07 depth patch/C6 captures, OneWorks reports, and hashes are preserved and reproducible. | Keep byte-for-byte; never apply the depth patch or copy OneWorks assets/renderer. |
| Optional future refinement | Cat-readability and root integration still lack accepted production-holder/bounded yaw-pitch evidence; original custom/share state is unavailable. | If desired, create a new narrowly scoped visual/refinement task after explicit product decision; do not revive the rejected C6/depth mechanism by assumption. |
| Feature branch | No unique Compact/fullscreen code; divergent bookkeeping ref at `b9a00ab...`, currently unbound. | Retain/block now; later tag exact tip and targeted-delete only after task/dirty/worktree reconciliation. |

## Related specs and files

- `.trellis/spec/frontend/index.md:1-47` — frontend scope and fixed 200x200/Compact constraints.
- `.trellis/spec/frontend/character-motion.md:1-73` — source-specific Compact leaf, behind-head composition, one-clock runtime, pointer/reduced-motion/disposal boundaries, and Lab-only `previewPose`.
- `.trellis/spec/frontend/component-guidelines.md` and `quality-guidelines.md` — composition boundary, no duplicate renderer/authority, cleanup, and no per-frame React/IPC motion.
- `.trellis/research/archive/2026-09/09-09-integrate-fullscreen-branch-work/research/fullscreen-branch-inventory.md:5-27,45-69,220-280` — accepted fullscreen chain already in `main`, old branch snapshot, dirty-path overlap, and no-current-integration plan.
- `.trellis/research/archive/2026-09/09-09-integrate-fullscreen-branch-work/research/branch-audit-active-work.md:60-143,290-328` — prior retain/block verdict and deletion gates for the Compact ref; live checks above update its stale-main caveat.
- `.trellis/research/archive/2026-09/09-09-integrate-fullscreen-branch-work/research/branch-cleanup-remote-policy.md:146-159,190-227,280-356` — archive-tag policy, local-only-main ordering, and remote-deletion boundary.
- `.trellis/workspace/Mabel-WIN/journal-6.md:10-41,183-229` — completed tooling history, prior Compact PASS, current workspace classification, and completed 09-09 root-integration session.
- `src/presentation/main-window/compactMascotDefinition.ts:49-86`, `compactMascotBehaviorRuntime.ts:34-153`, and `CompactMascot.tsx:57-138` — canonical geometry, shared root fix/preview seam, and production-vs-Lab runtime boundary.

## Caveats / Not Found

- The original fullscreen inventory was captured at `main@ff53f974...`; live plumbing now shows `main@f1b4991c...` and `origin/main` aligned to it. Refresh refs after the concurrent push before any branch/tag deletion.
- A new local `Wutpeach/mr9-ripple-preview` head at the same Ripple tip is attached to an Orca worktree and was not in the old nine-head table. It is outside this Compact decision but must be handled by the Lead’s complete local-only-main audit.
- No fresh remote fetch was performed in this worker task. The existing remote-policy report is read-only historical/API evidence; do not infer remote branch deletion permission from local tracking refs.
- No branch, tag, worktree, task metadata, product source, spec, package manifest, or evidence file was mutated here. Only this research report was written.
