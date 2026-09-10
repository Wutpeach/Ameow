# Branch audit: history, recovery, and temporary Ripple preview

Active task: `.trellis/tasks/09-09-integrate-fullscreen-branch-work`

Date: 2026-09-09 (Asia/Shanghai)

This is a read-only history/recovery audit. It covers the requested local refs
`cindy/auto-o3p8cr`, `history/m3-auto-o3p8cr-raw-snapshot`,
`recovery/main-pre-phase4-2b46f91`, and the temporary
`Wutpeach/mr9-ripple-preview` alias, together with the approved
`lab/mr9-ripple-source-fidelity` source relationship. No branch, worktree,
server, or product-file cleanup was performed here.

## Executive disposition

The current post-push tips observed in the local ref/log evidence are:

| Ref | Tip | Historical role | Recommendation toward a local `main`-only head list |
| --- | --- | --- | --- |
| `main` | `f1b4991c58982fc5a896e61bf58840c2aeec9cfa` | Current integration truth after the concurrent move to `origin/main` | Retain; reconcile once more before destructive work. |
| `origin/main` | `f1b4991c58982fc5a896e61bf58840c2aeec9cfa` | Remote-tracking copy of the post-push tip | Retain; never delete or rewrite the default branch. |
| `lab/mr9-ripple-source-fidelity` | `818057f664c7474ec1722b143fcc84dcf3ec67e9` | Approved, Lab-only Ripple source-fidelity checkpoint | Integrate a bounded source/UI diff, preserve the exact tip in history or a tag, then delete the local head only after validation. |
| `Wutpeach/mr9-ripple-preview` | `818057f664c7474ec1722b143fcc84dcf3ec67e9` | Temporary presentation alias at exactly the Ripple tip | No unique commit; close its Orca terminal/server/worktree, then delete the alias. |
| `cindy/auto-o3p8cr` | `342991724502ff067583d56fd877de9d1e536943` | M0/M1/M2 automation line and parent of the frozen dirty M3 worktree | Do not integrate M3. Delete only after the complete raw snapshot is independently verified; tag the tip if ancestry is not enough. |
| `history/m3-auto-o3p8cr-raw-snapshot` | `b4acb4addc98964b6d019c9874f6b20bd6093da8` | Non-Product raw M3 snapshot plus supersession disposition | Tag the exact tip and retain the tag/report/manifest before deleting the branch head. |
| `recovery/main-pre-phase4-2b46f91` | `2b46f91496214a85162593557f38c04267524deb` | Named rollback pointer for the pre-Phase-4 main baseline | Tag the exact pointer and verify final `main` ancestry before deleting the branch head. |

The accepted production fullscreen chain is already in `main`; the audit must
not replay it. The inventory describes that chain and the Ripple/Paper boundary
at `research/fullscreen-branch-inventory.md:5-27,45-69,116-163`. The cleanup
plan makes Ripple the only approved fullscreen experiment to integrate, keeps
it Lab-only, and excludes review artifacts and upstream images
(`research/ripple-lab-cleanup-plan.md:8-32,50-75,320-324`).

This report is intentionally limited to the requested history/recovery refs and
the Ripple preview/source pair. It is not, by itself, proof that every other
non-`main` head is disposable; the Lead must combine it with the sibling active-
branch and remote-policy reports before asserting that
`git branch --format='%(refname:short)'` contains only `main`.

## Durable ref and reflog evidence

The ref tips above are read-only observations made after the concurrent main
push. The reflogs provide the historical relationships without relying on a
branch name:

- `cindy/auto-o3p8cr` was created from `e40f5fe` and advanced through M0/M1
  lifecycle and documentation commits, M2 Pointer Field/Magnetic commits,
  architecture tests, and a final journal commit at `3429917`
  (`.git/logs/refs/heads/cindy/auto-o3p8cr:1-12`). The tip is an automation
  checkpoint, not a Ripple or accepted production-renderer source.
- `history/m3-auto-o3p8cr-raw-snapshot` was created from `3429917`, then
  recorded `b485d7a` (`chore(history): snapshot superseded M3 raw state`) and
  `b4acb4a` (`chore(history): mark M3 superseded by MR8`)
  (`.git/logs/refs/heads/history/m3-auto-o3p8cr-raw-snapshot:1-3`). This makes
  it the recovery descendant of the cindy tip, but the recovery guarantee is
  the raw manifest and disposition, not a Product merge.
- `recovery/main-pre-phase4-2b46f91` was created directly from
  `2b46f91` (`.git/logs/refs/heads/recovery/main-pre-phase4-2b46f91:1`). The
  Phase-4 design names this ref as the pre-integration rollback pointer and
  requires preserving it while advancing main
  (`.trellis/tasks/archive/2026-08/08-24-phase4-main-integration/design.md:3-11`).
- `lab/mr9-ripple-source-fidelity` was created from the immutable Product/Lab
  baseline `2bb9a22` and has one commit, `818057f`,
  (`.git/logs/refs/heads/lab/mr9-ripple-source-fidelity:1-2`). The temporary
  `Wutpeach/mr9-ripple-preview` ref was created directly from that same tip
  (`.git/logs/refs/heads/Wutpeach/mr9-ripple-preview:1`), proving that the
  preview alias cannot contain a unique commit.
- The concurrent push moved local `main` from `ff53f974` to
  `f1b4991` (`.git/logs/refs/heads/main:93`) and advanced the local
  `origin/main` tracking ref to the same tip (`.git/logs/refs/remotes/origin/main:7`).
  Any deletion or ancestry conclusion made from the earlier inventory's
  `ff53f974`/stale `5619ba0` pair must therefore be refreshed by the Lead.

## Branch-by-branch history and recovery audit

### `cindy/auto-o3p8cr` — M0/M2 automation line; dirty M3 is separate

**Purpose and unique work.** The branch's committed history is the M0/M1 main
window lifecycle foundation, M2 Pointer Field/Magnetic behavior, task/archive
records, and architecture tests, ending at `3429917` (reflog cited above). It
does not contain the approved Ripple checkpoint and has no unique accepted
fullscreen implementation. The branch is nevertheless the parent of the
`.cindy-worktrees/auto-o3p8cr` frozen dirty M3 state, so treating it as a
disposable automation branch without checking that worktree would be unsafe.

**Supersession.** M3's expanded DownloadIntake direction is explicitly
superseded by accepted MR8's Application-authored `acceptedTraceId`; the
historical disposition says M3 is non-Product recovery/research evidence and
must never be wholesale reintegrated
(`D:/Ameow-phase3/m3-history/.trellis/tasks/08-11-m3-download-intake-motion-planning/historical-disposition.md:3-16`).
The repository disposition lists the M3 tracked/untracked boundaries and says
to preserve them on a dedicated historical line, not in Product ancestry
(`.trellis/tasks/archive/2026-08/08-24-repository-state-consolidation/research/repository-disposition.md:46-49`).

**Recovery guarantee that would be lost.** The dirty worktree contains 16
tracked modified files and 16 individual untracked files. The authoritative
raw-byte manifest is
`398c293e75c565cefde7da28c6583aa44d8926fcf63f850ca368aaa967026383`; the
current raw stable patch ID is
`0da5bd7bddd5d3a812f66007f4a107a3a6945740`. The manifest, path list, and EOL
caveat are recorded in the disposition report
(`repository-disposition.md:122-166,168-199,221-258`). Deleting the branch and
its owning worktree before independently verifying the snapshot would lose
those uncommitted M3 bytes even though the clean `3429917` commit remains
identifiable.

**Minimum deletion condition.** First confirm that `b4acb4a` (or a newly made
archival tag at the exact `3429917` tip) is reachable and that the complete
32-row manifest matches byte-for-byte. Confirm the original M3 worktree has no
newer changes, and close/reconcile its in-progress task record. Only then may a
Lead delete `cindy/auto-o3p8cr`; do not cherry-pick M3 merely to make Git call
the branch merged. Recommended direct tag if the snapshot/ancestry check is
not accepted as sufficient:
`archive/branch/20260909-cindy-auto-o3p8cr-3429917` (the date-prefixed scheme
is also recorded in `research/branch-cleanup-remote-policy.md:296-310`).

### `history/m3-auto-o3p8cr-raw-snapshot` — non-Product historical recovery

**Purpose and unique work.** This line is intentionally historical: `b485d7a`
stores the raw M3 state and `b4acb4a` adds the disposition that marks it
superseded. The external historical disposition names the exact snapshot tip,
manifest, accepted MR8 implementation, and the instruction never to
wholesale-reintegrate M3 (`historical-disposition.md:3-16`). This is useful
recovery evidence even though the implementation itself is obsolete.

**Recovery guarantee that would be lost.** Removing the branch without another
reachable ref would make the raw snapshot and supersession record dependent on
reflog retention. The raw manifest is the evidence that the M3 dirty state was
preserved; it is not replaceable by a summary or by the MR8 Product commits.

**Minimum deletion condition and tag.** Create and verify an annotated tag at
`b4acb4addc98964b6d019c9874f6b20bd6093da8`, for example
`archive/branch/20260909-history-m3-auto-o3p8cr-raw-snapshot-b4acb4a`. Before
deleting the branch, verify that the tag resolves to that exact tip and that the
manifest, path list, and
`historical-disposition.md` remain readable. Keep the tag local unless the user
separately requests remote archival refs; do not reintroduce M3 into Product.

### `recovery/main-pre-phase4-2b46f91` — named rollback pointer

**Purpose and unique work.** This branch has no alternate fullscreen code; it is
a rollback identity created at `2b46f91496214a85162593557f38c04267524deb`
(`.git/logs/refs/heads/recovery/main-pre-phase4-2b46f91:1`). Phase-4 requirements
state that final `main` should advance from this exact pre-integration baseline
with a recovery ref retained (`.trellis/tasks/archive/2026-08/08-24-phase4-main-integration/prd.md:10-16`).

**Recovery guarantee that would be lost.** Deleting the named branch without a
replacement ref removes the explicit rollback handle. Main ancestry alone may
keep the commit object today, but it does not preserve the documented semantic
pointer or make recreating the pre-Phase-4 baseline obvious after reflog expiry.

**Minimum deletion condition and tag.** After the concurrent push settles, prove
that final `main` contains `2b46f91` and that no post-Phase-4 rollback decision
still relies on the branch name. Create and verify an annotated tag such as
`archive/branch/20260909-recovery-main-pre-phase4-2b46f91` at the exact hash;
only then delete the branch head. If ancestry cannot be proven, retain the
branch instead of using a forced delete.

### `lab/mr9-ripple-source-fidelity` — approved bounded Lab integration source

**Purpose and unique work.** The user-approved tip `818057f` is the strongest
fullscreen candidate, but it is a Lab-only feasibility checkpoint. Its runtime
is one fixed 200x200/r16 WebGL1 canvas, one program/draw, a bounded controller,
resize/context-loss restoration, and explicit resource cleanup; one-scene mode
binds the Ameow-owned fixture to both sampler roles. Controls are forward,
reverse, cancel-to-start/target, phase scrub, origin, and Pinch ON/OFF
(`research/ripple-lab-cleanup-plan.md:50-75`). The source report records ten
Ripple implementation/test files plus the fixture and identifies review media
as non-Product evidence (`research/ripple-lab-cleanup-plan.md:10-16`).

**Boundary and supersession.** This branch is not a replacement for
`ExpandedPresentationSurface`: it has no live Product scene-source contract,
Electron capture contract, macOS evidence, or cross-GPU proof
(`ripple-lab-cleanup-plan.md:68-75`). The accepted production Thermal/MR9
chain is already in `main`, so Ripple must not be copied into production
renderer code (`research/fullscreen-branch-inventory.md:9-27,93-163`).

**Minimum integration condition.** In a fresh, clean worktree based on the
post-push `main`, transplant only the bounded `src/lab/ripple/*` implementation,
tests, and Ameow fixture, then manually adapt the maintained Lab route/UI. Do
not copy `evidence/mr9-ripple/**`, upstream `image-a.png`/`image-b.png`, Paper
files, or production renderer code (`research/ripple-lab-cleanup-plan.md:320-324`).
Run the focused Ripple/scenario/renderer suites and repository type-check,
lint, build, docs, and browser/lifecycle gates listed in
`research/ripple-lab-cleanup-plan.md:326-391` before deleting this branch.

**Tag/deletion policy.** Preserve `818057f664c7474ec1722b143fcc84dcf3ec67e9`
in the integration report or an annotated tag such as
`archive/branch/20260909-lab-mr9-ripple-source-fidelity-818057f`. If the full commit is integrated as
an ancestor, ordinary `git branch -d` is the minimal safe deletion. If the Lead
uses a path-scoped transplant, the original tip will not be an ancestor; the
tag then becomes mandatory and deletion requires an explicit, authorized
forced-deletion decision. Never use `-D` solely to hide an unmerged source.

### `Wutpeach/mr9-ripple-preview` — duplicate temporary presentation alias

**Purpose and uniqueness.** The preview ref points at exactly the same
`818057f` object as the source branch and its reflog records creation from
`refs/heads/lab/mr9-ripple-source-fidelity`
(`.git/logs/refs/heads/Wutpeach/mr9-ripple-preview:1`). Read-only worktree
comparison found the ten Ripple files byte-for-byte equal after line-ending
normalization; `lab-main.tsx` and `PresentationLab.tsx` likewise compare equal
after normalization, with the raw `lab-main.tsx` difference limited to EOL
representation. No preview-only commit or recovery guarantee exists.

The temporary Orca worktree observed for this alias is:

```text
worktree: 43be5f83-b5e8-49ca-bafa-45e6f836c732::C:/Users/Administrator/orca/workspaces/Ameow/mr9-ripple-preview
terminal: term_b77942b9-7a50-4f28-8833-46a9d38b4049
preview:  http://127.0.0.1:1421/lab.html?ripple (historical route)
```

In the 2026-09-09 read-only `orca worktree ps` observation, this worktree showed
one attached terminal, no browser tabs, and no listener currently owning port
1421. The source worktree/port boundary
is also recorded in `research/branch-cleanup-remote-policy.md:166-179` and the
candidate route/port contract in `research/ripple-lab-cleanup-plan.md:18-26,219-223`.

**Minimum cleanup sequence (identify only; do not execute here).**

1. In the owning Orca session, inspect the preview worktree for uncommitted
   files and compare any dirty bytes against the source worktree. If anything
   is more than line-ending-only or otherwise unique, save a patch/report or
   stop for explicit approval; never force-remove a dirty worktree.
2. Stop the owning Vite process gracefully if one is running, then verify port
   `1421` is free. Do not kill an arbitrary process by port. The candidate plan
   requires this server quiescence before worktree removal
   (`research/branch-cleanup-remote-policy.md:280-294`).
3. Close/release terminal `term_b77942b9-7a50-4f28-8833-46a9d38b4049`, then
   remove Orca worktree
   `43be5f83-b5e8-49ca-bafa-45e6f836c732::...mr9-ripple-preview` through the
   Orca worktree API/CLI. Confirm no attached terminal or browser session still
   references it.
4. After the worktree is gone and the source tip is preserved by the bounded
   integration report/tag, delete `Wutpeach/mr9-ripple-preview` as a targeted
   local ref. The duplicate needs no separate archival tag because its exact
   commit is already the source tip; add one only if the Lead wants an explicit
   preview alias record.

The source branch's separate `.cindy-worktrees/mr9-ripple-source-fidelity`
worktree must not be removed as part of preview cleanup until its own Vite
process and status are checked; it is the integration source, not the duplicate
alias (`research/branch-cleanup-remote-policy.md:177-179`).

## What deleting these refs would and would not affect

| Ref | Unique accepted Product/fullscreen work? | Loss without prerequisite | Safe archival condition |
| --- | --- | --- | --- |
| `cindy/auto-o3p8cr` | No; M0/M2 commits are historical automation, M3 is dirty and superseded | Uncommitted 32-file M3 state and its byte manifest | `b4acb4a` manifest independently verified, task/worktree reconciled, and optional direct tag at `3429917` |
| `history/m3-auto-o3p8cr-raw-snapshot` | No; historical evidence is unique, implementation is superseded | Raw snapshot/disposition becomes reflog-only | Annotated `archive/branch/20260909-history-m3-auto-o3p8cr-raw-snapshot-b4acb4a` resolves exactly and evidence remains readable |
| `recovery/main-pre-phase4-2b46f91` | No; named rollback pointer only | Explicit pre-Phase-4 rollback handle | Annotated `archive/branch/20260909-recovery-main-pre-phase4-2b46f91` plus final-main ancestry proof |
| `lab/mr9-ripple-source-fidelity` | Yes, as approved Lab-only source; no Product renderer | Approved source hash and ability to prove exact implementation if integration is path-scoped | Bounded integration gates pass and exact tip is in main history or `archive/branch/20260909-lab-mr9-ripple-source-fidelity-818057f` |
| `Wutpeach/mr9-ripple-preview` | No; exact duplicate tip | Orca session/worktree if removed before quiescence; no unique Git object | Clean/reconciled worktree, stopped server, released terminal, source tip retained |

## Explicit Lead Git-plumbing questions

Before any branch deletion or local-only-main claim, the Lead must answer these
with fresh read-only checks after the concurrent push:

1. Has the concurrent push fully settled, and what are the final `main`,
   `origin/main`, `origin/HEAD`, and any server branch tips? The earlier
   inventory's `ff53f974` and `5619ba0` values are stale; the reflogs show the
   move to `f1b4991` but do not replace a fresh ref/API check.
2. Does final `main` still contain `2b46f91`, `2bb9a22`, and the accepted
   production chain (`48987f7` through `0e24a7a`)? If not, stop and retain the
   recovery pointer; do not force-delete it.
3. Will Ripple be integrated as a full commit (so the source tip becomes an
   ancestor and `git branch -d` is valid) or as a bounded path transplant (so
   an archival tag plus an explicit forced-deletion policy is required)?
4. Before deleting the preview alias, is the Orca worktree clean, and are any
   uncommitted files more than line-ending-only changes? Is port 1421 free and
   the owning terminal/server released?
5. Does `b4acb4a` independently preserve the complete 32-row M3 manifest before
   `cindy/auto-o3p8cr` and its worktree are removed? Has the M3 task been closed
   or explicitly archived as superseded by MR8?
6. Should the recovery pointer be converted to the recommended archival tag
   before deleting its branch, and where will the exact tag/hash be recorded?
7. Is remote cleanup in scope? A fresh fetch/prune, current server ref/open-
   review check, and explicit user authorization are required. Never delete
   `origin/main` or `origin/HEAD`; the remote predecessor and local-only
   candidates are separate decisions (`research/branch-cleanup-remote-policy.md:487-504`).

Until those answers and the Ripple integration gates are complete, the only
safe action is to retain the refs/worktrees and preserve the evidence. This
report intentionally performs no cleanup and does not authorize branch, tag,
worktree, process, or remote mutation.
