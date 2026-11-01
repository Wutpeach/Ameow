# Final planning check

- Date: 2026-09-09 (Asia/Shanghai)
- Active task: `.trellis/tasks/09-09-integrate-fullscreen-branch-work`
- Review type: independent planning/spec check only
- Verdict: **PASS**

## Executive verdict

The plan prevents a merge-all outcome. It treats every non-`main` branch as
untrusted evidence, permits contribution only from the ten exact Ripple paths
at `818057f664c7474ec1722b143fcc84dcf3ec67e9`, and requires all other branch
content to be proved already covered or preserved as archive-only evidence.
Branch deletion is downstream of validation and exact annotated-tag recovery;
it is never used as a reason to merge rejected, superseded, duplicate, failed,
candidate-only, or history-only bytes.

No unresolved product decision remains in the planning artifacts. The later
explicit implementation approval and Trellis Phase 3.4 commit-group approval
remain intentional workflow gates, not missing product choices.

## Findings (fixed)

### Exact cleanup mapping was not self-contained in the executable checklist

- File: `implement.md`
- Issue: the PRD, design, and synthesis contained the reviewed branch hashes and
  dispositions, but the runnable cleanup section referred generically to “each
  named non-main branch.” A future executor could have needed to reconstruct the
  exact mapping from several reports.
- Fix: added one exact local-head execution matrix with every current local head,
  full reviewed tip, allowed contribution, preservation gate, worktree gate, and
  targeted deletion disposition. The matrix explicitly forbids wildcard/prefix/
  bulk deletion, merge-all, and broad cherry-pick operations; it also records the
  conditional `-D` boundary and remote-ref exclusions.
- Decision status: mechanical convergence only. Every value and disposition was
  copied from the already-approved synthesis and current live read-only ref
  snapshot; no new product or cleanup decision was introduced.

## Findings (not fixed)

No planning defect remains that requires revision.

The following unsettled repository facts are correctly represented as hard
preconditions and were not changed by this planning-only review:

- The main worktree is dirty with the retained 09-07 Compact Lab seam plus
  unrelated tracked and untracked files. No reset, stash, clean, staging, or
  product edit is authorized.
- The 09-07 task still records `in_progress`. Its seam must be preserved and
  committed first, then the task must be archived explicitly as stopped/rejected
  with unmet geometry criteria and no Architecture PASS. That is required future
  execution, not a reason to change its historical evidence during this review.
- Several non-main heads still own worktrees. Each worktree/session must be clean,
  quiescent, reconciled, and released by its owner before its exact branch can be
  deleted.
- Implementation has not been approved or started. The Lead must present the
  final plan, receive explicit implementation approval, then run `task.py start`.
- Commits remain subject to the separate Phase 3.4 confirmation gate. Remote
  branch deletion and pushing archival tags remain out of scope.

## Audit results

| Dimension | Result | Evidence and conclusion |
| --- | --- | --- |
| Merge-all prevention | PASS | PRD R5, the design selective-integration gate, the implementation allowlist, and the new exact execution matrix all say a branch is evidence rather than an integration unit. Only approved, necessary, non-duplicate paths may be staged. |
| Requirement convergence | PASS | PRD, design, implementation plan, manifests, task metadata, and the synthesis agree on Ripple-only fullscreen experimentation, Lab-only Intake/Heatmap removal, Compact preservation, local-head cleanup, and remote exclusion. Older worker-report dispositions are historical inputs; `branch-integration-synthesis.md` explicitly reconciles and supersedes them as the current source of truth. |
| Exact refs and dispositions | PASS | The live read-only ref snapshot matches the reviewed tips for all ten local heads. `main`, `origin/main`, and `origin/HEAD` all resolve to `f1b4991c58982fc5a896e61bf58840c2aeec9cfa`. Every non-main head now has a full-hash row and a no-contribution, selective-contribution, or recovery-only disposition in `implement.md`. |
| Ripple allowlist | PASS | Exactly ten `src/lab/ripple/` implementation/test/fixture paths are allowlisted from `818057f664c7474ec1722b143fcc84dcf3ec67e9`. Existing Lab shell/scenario/locale/test files are manual adaptations, not whole-commit imports. Candidate review evidence and upstream A/B images are excluded. |
| Production boundary | PASS | Ripple remains below `src/lab/`, uses WebGL1 and one Ameow-owned fixture, and has no Product/Electron scene-source or capture contract. The plan forbids edits/imports into the production renderer and requires focused import/isolation tests plus a production-bundle identifier scan. |
| Lab Intake/Heatmap cleanup | PASS | Removal is limited to Lab choices, activation/heatmap state, presets, routes, flags, marker/readout behavior, locale keys, and obsolete tests. Download, Transcode, Mixed, Compact, production `ExpandedPresentationSurface`, Intake/Folder policy, Heatmap/Refraction runtime/shaders, Electron wiring, and production tests remain. |
| Dead residue and duplicate prevention | PASS | The final-diff gate explicitly rejects dead UI/state/copy/tests, unused fixtures/assets/dependencies, candidate-only evidence, duplicate implementations/abstractions, Paper/GSAP material, and anything without an accepted consumer. |
| Compact seam and archive semantics | PASS | The plan preserves and commits the validated Lab-only frozen-pose seam before overlapping Ripple edits, keeps the accepted behind-head composition already in `main`, restores no rejected C6/depth geometry, leaves OneWorks cleanup unclaimed, and archives 09-07 only as stopped/rejected with no Architecture PASS. The historical patch hash remains `B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D`. |
| Dirty worktree and concurrent-session safety | PASS | Exact dirty paths, ref tips, worktree ownership, and session ownership must be revalidated before implementation/ref mutation. Any active owner, unrecoverable dirty byte, changed tip, or dirty worktree is a stop condition. No blanket stash/reset/clean/checkout or incidental staging is permitted. |
| Tag-before-delete recovery | PASS | Each divergent/historical tip requires an annotated local tag whose peeled object equals the captured full hash. Ordinary `-d` is tried for ancestors; `-D` is allowed only for the same explicit verified divergent tip after tag, dirty-data, worktree, and authorization gates. Preview may share the source tag only because both refs resolve to the identical object. |
| M3, diagnostics, and recovery gates | PASS | M3 requires the complete 32-file raw-manifest verification; diagnostics requires canonical `b9ba0278d9f49d1831f5acbf813448072f53178b` coverage plus worktree/task reconciliation; recovery requires final-main ancestry for `2b46f91496214a85162593557f38c04267524deb`. None may contribute bytes merely to permit deletion. |
| Remote exclusions | PASS | No remote branch is deleted and no archival tag is pushed. `main`, `origin/main`, `origin/HEAD`, and the three open-PR docs branches are retained. Any later remote `motion/presentation-integration` deletion requires fresh server/PR/ancestry evidence and separate explicit authorization. |
| Sequencing and rollback | PASS | Compact preservation precedes overlapping edits; implementation and independent checking precede commits; final-diff review precedes ref cleanup; preview shutdown follows maintained-Lab validation; tags precede branch deletion. Rollback uses branch recreation from verified tags or `git revert`, never reset/force-push, reflog expiry, prune-now, wildcard deletion, or broad worktree removal. |
| Validation coverage | PASS | Focused Ripple controller/source/isolation/scenario/runtime/reuse tests cover forward/reverse/cancel/scrub/origin/Pinch, replacement, Reduced Motion, cleanup, context recovery, failure UI, one pending rAF, one-scene texture identity, routing, and mutual exclusion. Repository gates cover type-check, lint, Product/Lab tests, renderer/app/docs builds, browser behavior, production bundle isolation, and whitespace. |

## Exact reviewed local-head snapshot

| Local head | Tip | Final plan disposition |
| --- | --- | --- |
| `main` | `f1b4991c58982fc5a896e61bf58840c2aeec9cfa` | Retain. |
| `lab/mr9-ripple-source-fidelity` | `818057f664c7474ec1722b143fcc84dcf3ec67e9` | Selective ten-path Ripple source only; tag, verify, targeted-delete after validation. |
| `Wutpeach/mr9-ripple-preview` | `818057f664c7474ec1722b143fcc84dcf3ec67e9` | Duplicate alias; no bytes; quiesce/reconcile worktree, rely on verified source tag, targeted-delete. |
| `motion/mr9-paper-heatmap-official-baseline` | `77eb5611178a06f7079db29563c9ef75197d7af8` | Rejected archive-only; tag, verify, targeted-delete. |
| `feat/compact-mascot-depth-occlusion` | `b9a00ab93f15bbaf301e2b129406b0b5f16c69fb` | No branch bytes; preserve dirty seam/close 09-07 first, then tag, verify, targeted-delete. |
| `chore/trellis-tooling-0.6.15` | `40d31d38c4e140f389bbb1ba066b58fba3e43a91` | Tooling archive-only; tag, verify, targeted-delete. |
| `repair/diagnostics-readability-export-cleanup` | `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` | Patch-equivalent archive-only; prove canonical coverage/reconcile worktree, tag, verify, targeted-delete. |
| `cindy/auto-o3p8cr` | `342991724502ff067583d56fd877de9d1e536943` | Superseded M3 lineage; verify raw manifest, tag, verify, release worktree, targeted-delete. |
| `history/m3-auto-o3p8cr-raw-snapshot` | `b4acb4addc98964b6d019c9874f6b20bd6093da8` | Historical raw snapshot; tag, verify evidence, release worktree, targeted-delete. |
| `recovery/main-pre-phase4-2b46f91` | `2b46f91496214a85162593557f38c04267524deb` | Recovery identity; prove ancestry, replace with verified tag, targeted-delete. |

## User-owned decisions

No product decision remains open:

- Ripple is the default and sole fullscreen experiment in the maintained Lab.
- Download, Transcode, Mixed, and Compact remain as non-competing fixture/target lanes.
- `?ripple` and `?ripple=scene` are removed; `?theme=white` remains.
- Ripple export is hidden rather than adapted.
- Intake/Heatmap removal is Lab-only.
- The 09-07 seam is preserved, while final geometry is rejected and receives no Architecture PASS.
- Every non-`main` local head is eventually removed only after its individual recovery gate.
- Archive tags remain local; remote deletion is excluded.

Only the later implementation and commit confirmations remain user-owned, as
required by the Trellis workflow.

## Sources reviewed

Read completely: this task's `prd.md`, `design.md`, `implement.md`,
`implement.jsonl`, `check.jsonl`, `task.json`, and every pre-existing report in
its `research/` directory. Also read the relevant 09-07 Compact PRD/design/plan,
manifests/task metadata, implementation/check/planning/stop reports, historical
stop README, and the completed 09-09 ear-root integration PRD/design/reports/task
record, plus all frontend files named by this task's check manifest.

## Verification

- `python ./.trellis/scripts/task.py validate .trellis/tasks/09-09-integrate-fullscreen-branch-work`: **pass**.
- `git diff --check -- .trellis/tasks/09-09-integrate-fullscreen-branch-work`: **pass**.
- Whole-repository lint/type-check/build/test: **not run by design**. Product
  implementation has not started, and the shared worktree contains unrelated
  edits; the dispatch explicitly excluded those suites from this planning review.

## Modified files

- `.trellis/tasks/09-09-integrate-fullscreen-branch-work/implement.md`
- `.trellis/tasks/09-09-integrate-fullscreen-branch-work/research/final-planning-check.md`
