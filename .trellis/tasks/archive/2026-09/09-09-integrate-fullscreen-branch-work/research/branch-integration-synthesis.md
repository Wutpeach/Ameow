# Research: fullscreen branch integration synthesis

- Query: Consolidate the four Orca research-worker reports into one current source of truth for Ripple integration, Compact reconciliation, local branch cleanup, recovery, and remote boundaries.
- Scope: internal repository evidence plus the read-only GitHub observations already recorded by the workers.
- Date: 2026-09-09 (Asia/Shanghai)

## Worker reports reconciled

| Topic | Orca task / dispatch | Durable report | Accepted result |
| --- | --- | --- | --- |
| Active development branches | `task_99a41ac17b3b` / `ctx_253ca5c44a79` | `research/branch-audit-active-work.md` | Compact is blocked on 09-07 task/dirty-data reconciliation; tooling and diagnostics need exact-tip archival before deletion. |
| History and recovery refs | `task_de394deae2e4` / `ctx_ead877bc4281` | `research/branch-audit-history-recovery.md` | M3/history/recovery refs are non-Product evidence that can become tags; the Ripple preview branch is an exact duplicate alias. |
| Remote and cleanup policy | `task_bcfe6c9416bc` / `ctx_051b8a6177fc` | `research/branch-cleanup-remote-policy.md` | Remote docs branches have open PRs; remote deletion is separate from the local-only-`main` goal. |
| Compact task status | `task_7bbd61de2be3` / `ctx_c1e09c6072c6` | `research/compact-task-status-reconciliation.md` | 09-09 ear-root integration is complete; 09-07 is a stopped/rejected refinement with retained dirty Lab work and no Architecture PASS. |

All four workers reported `succeeded`; their Deliveries were reviewed and acknowledged. Their retained terminals were explicitly closed after the user requested resource cleanup.

## Current integration truth

- The accepted production fullscreen lineage is already in `main`. Do not replay the MR7/MR8/MR9 production chain.
- `lab/mr9-ripple-source-fidelity` at `818057f664c7474ec1722b143fcc84dcf3ec67e9` is the user-approved latest Ripple checkpoint. It is a Lab-only WebGL1 experiment, not a production renderer replacement.
- `motion/mr9-paper-heatmap-official-baseline` at `77eb5611178a06f7079db29563c9ef75197d7af8` is a final NO-GO and must not be integrated.
- `Wutpeach/mr9-ripple-preview` points at the same `818057f` object and has no unique commit.
- The post-push snapshot observed by the workers has local `main`, `origin/main`, and `origin/HEAD` at `f1b4991c58982fc5a896e61bf58840c2aeec9cfa`. Re-check immediately before implementation or ref mutation because this value is an observation, not a permanent assumption.
- The current main worktree still contains unrelated dirty files and the retained 09-07 Compact Lab seam. No implementation or branch cleanup may overwrite, reset, clean, or incidentally stage them.

## Required product result

The maintained `lab.html` route should present Ripple as the default Full experiment. It should remove Lab-only Intake and Heatmap choices while retaining Download, Transcode, Mixed, Compact, the existing shell, and `?theme=white`. The candidate-only `?ripple` and `?ripple=scene` aliases should disappear. Ripple controls remain forward, reverse, cancel-to-start/target, phase scrub, origin, and Pinch ON/OFF. The generic WebGL2 export action stays hidden while Ripple is selected.

Only the ten allowlisted Ripple implementation/test/fixture paths from `818057f` are transplanted. Existing Lab shell files are adapted manually. Review evidence, upstream A/B images, Paper/GSAP material, and production renderer changes are excluded. `THIRD_PARTY_NOTICES.md` receives the Ripple MIT/source-modification attribution.

Local branch consolidation is deliberately selective. A branch is evidence, not a merge unit: only bytes required by an accepted outcome may enter `main`. Superseded, duplicate, rejected, failed, or history-only work is preserved by an exact annotated local tag when recovery value exists, then its branch can be deleted without importing that content into the maintained tree.

## Local branch disposition

| Local branch | Current disposition | Required preservation/deletion gate |
| --- | --- | --- |
| `main` | Retain | Logical/default branch; never delete or force-rewrite. |
| `lab/mr9-ripple-source-fidelity` | Integrate, tag, delete | Path-scoped Ripple integration passes all gates; tag exact `818057f` because the source commit will not become a `main` ancestor. |
| `Wutpeach/mr9-ripple-preview` | Close and delete | Confirm preview worktree/server is quiescent and clean; source tip is already preserved. |
| `motion/mr9-paper-heatmap-official-baseline` | Reject, tag, delete | Preserve exact `77eb561` as rejected research; never transplant Paper code/assets/dependencies. |
| `feat/compact-mascot-depth-occlusion` | Block, then tag/delete | First resolve the 09-07 dirty Lab seam and task ownership. The branch itself has no unique Compact/fullscreen product code. |
| `chore/trellis-tooling-0.6.15` | Tag and delete | Preserve exact `40d31d38`; no fullscreen work. |
| `repair/diagnostics-readability-export-cleanup` | Reconcile, tag, delete | Prove canonical `b9ba0278` coverage, align the stale worktree task, and preserve exact `353a7984`/patch identity. |
| `cindy/auto-o3p8cr` | Verify snapshot, tag/delete | Verify the 32-file M3 raw manifest before releasing its worktree; never reintegrate superseded M3 Product work. |
| `history/m3-auto-o3p8cr-raw-snapshot` | Tag and delete | Preserve exact `b4acb4a` plus manifest/disposition. |
| `recovery/main-pre-phase4-2b46f91` | Tag and delete | Prove final `main` ancestry and preserve exact `2b46f91` as the semantic rollback tag. |

Each unmerged/divergent tip must have an annotated local tag that peels to the recorded exact commit before its named branch is deleted. Tags remain local by default. Deletions are targeted one branch at a time; no wildcard or bulk force operation is allowed.

## Remote boundary

The user-defined completion invariant is the local heads namespace: `git branch --format='%(refname:short)'` outputs only `main`. Remote-tracking refs and local archival tags do not violate it.

GitHub currently has `main`, three docs branches with open PRs, and `motion/presentation-integration`. No Ripple or Paper server branch exists. This task will not delete remote branches or push archive tags. Optional deletion of remote `motion/presentation-integration` requires a fresh server/PR/ancestry check and separate explicit authorization.

## Resolved product decision

The user accepted the recommended Compact closure. Preserve and commit the validated 09-07 Lab-only frozen-pose seam, archive 09-07 as stopped/rejected because its final geometry was not accepted, grant no Architecture PASS, stop further Compact geometry research in this task, and retain the failed experiments and immutable historical evidence. Any future geometry work must start as a new task.

## Caveats / Not Found

- This synthesis does not itself authorize implementation, task activation, commits, tag creation, branch deletion, worktree removal, preview shutdown, push, or remote deletion.
- Exact refs, worktree ownership, dirty-path recovery, and tag peeling must be revalidated immediately before destructive operations.
- Archive tags preserve committed objects only; uncommitted tracked and untracked data need their own commit or verified external recovery record first.
