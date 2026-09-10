# Research: branch cleanup and remote policy

- Query: Audit current GitHub branches and pull-request associations, reconcile them with the stale local `origin/*` evidence, and define a failure-safe path to integrate the approved Ripple Lab cleanup, preserve every unique local tip, close the preview worktree/server, remove every non-`main` local branch, and optionally retire a stale remote development branch.
- Scope: mixed (read-only GitHub REST API plus existing local task reports; no local Git mutation)
- Date: 2026-09-09 (Asia/Shanghai)
- Active task: `.trellis/tasks/09-09-integrate-fullscreen-branch-work`

## Executive result

The GitHub API currently exposes five server branches: `main`, three open docs
branches, and `motion/presentation-integration`. It exposes no Ripple or Paper
branch. The server default is `main`; the branch API reports every branch as
unprotected, the dedicated protection endpoint returns 404, and no repository
rulesets were returned. Treat `main` as protected by policy anyway: never delete,
force-update, or recreate it merely because GitHub has no configured protection.

The local report was taken before the current concurrent push and records
`main` at `ff53f9749aa095c69f8a84d6537838d46ce3037c`, stale `origin/main` at
`5619ba031163c3dab7071f67ad4739d49b1f095f`, and stale
`origin/motion/presentation-integration` at the same `48987f7` predecessor that
the server still exposes. The server now reports `main` at
`f1b4991c58982fc5a896e61bf58840c2aeec9cfa` and confirms it is 115 commits ahead
of the stale `5619ba0` baseline; refresh after the other Codex push before
making any integration or deletion decision. The API could not resolve local
candidate commits `818057f` (Ripple) or `77eb561` (Paper), so their local
branches must be treated as local-only evidence until explicitly archived.

The safe policy is: integrate only the approved Ripple Lab source/UI diff in a
fresh clean worktree based on the refreshed `main`; keep production
`ExpandedPresentationSurface` untouched; validate; record every branch tip in
an annotated archival tag (or prove it is reachable from `main`); stop the
preview server and remove its worktree; then delete named non-`main` local heads
one at a time. Use `git branch -d` only for proven ancestors and use `-D` only
after an exact tag/recovery check and the user's local-only-main decision. A
remote delete is a separate, optional, explicitly authorized action and may
target only `motion/presentation-integration` after a fresh server check.

## Facts observed from the GitHub API

The following calls were read-only and authenticated as `Wutpeach` on
2026-09-09. Branch tips are commit tips, not inferred from the stale local
tracking refs.

### Repository/default-branch policy

`GET /repos/Wutpeach/Ameow` returned:

~~~json
{
  "default_branch": "main",
  "visibility": "public",
  "archived": false,
  "delete_branch_on_merge": true,
  "allow_merge_commit": true,
  "allow_rebase_merge": true,
  "allow_squash_merge": true
}
~~~

`GET /repos/Wutpeach/Ameow/branches/main/protection` returned HTTP 404
(`Branch not protected`). `GET /repos/Wutpeach/Ameow/rulesets` returned an empty
list. This is an absence of GitHub enforcement, not permission to remove the
default branch; the cleanup plan must keep a logical `main` safeguard.

### Current server branches

`GET /repos/Wutpeach/Ameow/branches` returned exactly these five branches
(all had `protected: false`):

| Server branch | Tip | Commit date (UTC) | Association / disposition |
| --- | --- | --- | --- |
| `main` | `f1b4991c58982fc5a896e61bf58840c2aeec9cfa` | 2026-09-09 07:21:53 | Default; retain. Tip message: `chore: record journal`. |
| `motion/presentation-integration` | `48987f7f65bcf5bba7547152441b14cf8853809c` | 2026-08-14 14:13:08 | Accepted Expanded substrate predecessor; candidate for optional remote deletion only after ancestry/review checks. |
| `docs/adopt-starlight-black-theme` | `55e2b095c5a0349cb37f014d2ec5b0bce0687dc7` | 2026-08-20 11:40:38 | Open PR #7; retain. |
| `docs/developer-maintainer-docs` | `31254f01b6f8ff02c4d356c10c89ab16a516ef7f` | 2026-08-20 07:58:47 | Open PR #6; retain. |
| `docs/user-docs-restructure` | `e198f3c71b04102555752636dff0a1d195ee7bac` | 2026-08-20 02:33:16 | Open PR #5; retain. |

The API returned `404 Branch not found` for
`lab/mr9-ripple-source-fidelity` and
`motion/mr9-paper-heatmap-official-baseline`, and `422 No commit found` when
looking up `818057f...` and `77eb561...`. This means there is no server-side
Ripple/Paper ref to delete at this observation point; it does not erase the
local evidence or prove those refs were never pushed.

### Pull-request associations

`GET /repos/Wutpeach/Ameow/pulls?state=all&per_page=100` returned only six PRs:

| PR | State | Head | Base | Tip | Relevance |
| --- | --- | --- | --- | --- | --- |
| #7 | open | `docs/adopt-starlight-black-theme` | `main` | `55e2b095...` | Active docs review; do not delete its branch. |
| #6 | open | `docs/developer-maintainer-docs` | `main` | `31254f01...` | Active docs review; do not delete its branch. |
| #5 | open | `docs/user-docs-restructure` | `main` | `e198f3c7...` | Active docs review; do not delete its branch. |
| #3 | closed/merged | `fix/custom-macos-create-dmg` | `main` | `604baf88...` | Historical macOS PR; not a current server branch. |
| #2 | closed/merged | `mac/fix-compact-window-parity` | `main` | `b63b936a...` | Historical macOS PR; not a current server branch. |
| #1 | closed/merged | `mac/fix-compact-window-parity` | `main` | `c849cae5...` | Historical macOS PR; not a current server branch. |

There is no open or closed PR association for the server motion branch, the
local Ripple branch, or the local Paper branch in this result. This is useful
negative evidence only; check again immediately before any remote deletion.

### Server ancestry reconciliation

The compare API returned:

~~~text
GET /compare/5619ba0...f1b4991c
status=ahead, ahead_by=115, behind_by=0,
merge_base=5619ba0..., total_commits=115

GET /compare/motion%2Fpresentation-integration...main
status=ahead, ahead_by=96, behind_by=0,
base=48987f7..., merge_base=48987f7..., total_commits=96

GET /compare/main...motion%2Fpresentation-integration
status=behind, ahead_by=0, behind_by=96,
merge_base=48987f7..., total_commits=0
~~~

Therefore the server motion branch is an exact ancestor of the current server
`main` and has no unique commits. The stale local `origin/main` hash is not a
current server tip. A compare request using local report tip `ff53f974...`
returned 404, so that local hash was not available to the API at query time;
the concurrent push may have replaced it with `f1b4991c...`. Do not fast-forward
or delete based on `ff53f974...` until a clean worktree refresh resolves this.

### Server tags

`GET /repos/Wutpeach/Ameow/tags` returned the same release/runtime tag family
recorded locally (`v0.3.1` through `v0.1.0`, `testWebhook-1`, and the two
runtime-sidecars tags). No post-Lab archive tag exists on the server. New
archive tags should remain local by default; pushing them would be a separate
user decision and is not needed for local branch-list cleanup.

## Facts retained from local report evidence

The following is not a fresh local Git query. It is transcribed from
`research/fullscreen-branch-inventory.md` and
`research/ripple-lab-cleanup-plan.md`, both dated 2026-09-09 and explicitly
read-only.

### Local heads and stale remote-tracking refs

| Local ref | Tip from report | Existing disposition | Cleanup treatment under the local-only-main requirement |
| --- | --- | --- | --- |
| `refs/heads/main` | `ff53f9749aa095c69f8a84d6537838d46ce3037c` | Current truth; retain | Protected logical base; never delete. Reconcile with refreshed server `main` first. |
| `refs/heads/lab/mr9-ripple-source-fidelity` | `818057f664c7474ec1722b143fcc84dcf3ec67e9` | Approved Ripple Lab checkpoint; previously “defer” in inventory | Integrate the bounded Lab-only source/UI diff, tag the exact tip, then delete the local head after validation. |
| `refs/heads/motion/mr9-paper-heatmap-official-baseline` | `77eb5611178a06f7079db29563c9ef75197d7af8` | Final Paper NO-GO | Do not integrate. Tag the exact tip as rejected research evidence, then delete the local head so only `main` remains. |
| `refs/heads/feat/compact-mascot-depth-occlusion` | `b9a00ab93f15bbaf301e2b129406b0b5f16c69fb` | Active unrelated mascot work and dirty-path owner | Commit/integrate the user's work or explicitly archive its tip and dirty patch before deleting the head. Never lose uncommitted changes. |
| `refs/heads/chore/trellis-tooling-0.6.15` | `40d31d38c4e140f389bbb1ba066b58fba3e43a91` | Unrelated tooling | Tag tip for recovery, then targeted delete. |
| `refs/heads/cindy/auto-o3p8cr` | `342991724502ff067583d56fd877de9d1e536943` | Unrelated automation | Tag tip for recovery, then targeted delete. |
| `refs/heads/history/m3-auto-o3p8cr-raw-snapshot` | `b4acb4addc98964b6d019c9874f6b20bd6093da8` | Historical M3 snapshot | Tag tip for history, then targeted delete. |
| `refs/heads/recovery/main-pre-phase4-2b46f91` | `2b46f91496214a85162593557f38c04267524deb` | Recovery pointer | Tag tip before deletion; the tag is the rollback pointer after local-only-main is achieved. |
| `refs/heads/repair/diagnostics-readability-export-cleanup` | `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` | Diagnostics-only repair | Tag tip for recovery, then targeted delete. |
| `refs/remotes/origin/main` | `5619ba031163c3dab7071f67ad4739d49b1f095f` | Stale pre-Lab tracking ref | Refresh/prune only after the concurrent push; never treat as server truth. |
| `refs/remotes/origin/HEAD` | `5619ba031163c3dab7071f67ad4739d49b1f095f` | Stale symbolic default pointer | Re-point to server default with `git remote set-head origin -a`; never delete. |
| `refs/remotes/origin/motion/presentation-integration` | `48987f7f65bcf5bba7547152441b14cf8853809c` | Accepted predecessor, already in main ancestry | Keep until optional remote deletion is authorized and verified; a local archival tag can preserve its exact old tip. |

The reports also record more than 38,000 untracked generated/runtime lines and
dirty Compact mascot paths that overlap candidate Lab files. Those paths are
outside the Ripple transplant and must not be staged incidentally. A blind
cherry-pick is specifically unsafe because candidate `lab-main.tsx`,
`PresentationLab.tsx`, locales, `rendererReuse.test.ts`, and `scenarios.ts/test`
overlap the current Compact edits.

### Fullscreen evidence that affects cleanup

- The accepted production chain (`48987f7` substrate, `c762c143`, `30e0e545`,
  `e01be015`, `046f228c`, `25040db`, `0e24a7a`) is already in `main`; replaying
  those commits is unnecessary and risks conflicts.
- The approved Ripple tip `818057f` is a Lab-only WebGL1, one-scene checkpoint.
  It has no Product scene-source contract and must not be copied into
  `ExpandedPresentationSurface` or Electron production code.
- The Paper line (`9221927` prerequisite and `77eb561` derivative) is a final
  NO-GO. Its dependency, shader, notices, SVGs, and comparison UI stay out of
  `main`; the branch tip is retained only as tagged research evidence.
- The isolated candidate worktree is
  `.cindy-worktrees/mr9-ripple-source-fidelity` and its preview uses port 1421.
  Stop the owning preview process before removing that worktree or its branch.

## Reconciliation and policy decisions

1. **Local reports are historical snapshots; the API is the current remote
   observation.** The stale `origin/main` ref being 115 commits behind the API
   `main` is expected. A fresh fetch is a prerequisite for any ancestry or
   deletion assertion, not an optional cleanup nicety.
2. **`motion/presentation-integration` is the only plausible remote cleanup
   target.** It is still on the server, has no PR association, and is proven by
   the compare API to be an ancestor of `main`. It is not safe to delete from
   the stale tracking ref alone; re-check its tip and open reviews immediately
   before asking for authorization.
3. **Docs branches are not stale fullscreen branches.** PRs #5/#6/#7 are open;
   do not prune them as part of this task. `main` and all default pointers are
   also protected by policy regardless of the unprotected API flag.
4. **Local-only-main requires archival refs for otherwise unrelated work.** The
   existing “retain” classifications for Paper, mascot, tooling, automation,
   history, recovery, and diagnostics describe their value, not a permanent
   exception to the user's final branch-list requirement. Preserve each exact
   tip in a tag (and save any dirty patch) before targeted deletion.
5. **A tag is stronger than a reflog.** Reflogs expire and are not a rollback
   contract. Annotated tags under
   `archive/branch/20260909-<slug>-<shortsha>` keep the object reachable and
   make recreation deterministic. Do not push archive tags unless the user
   separately asks for remote recovery refs.

## Minimal failure-safe ordering (commands are future plan only)

The following commands were not run during this research. They are an ordered
runbook for a clean integration owner after the concurrent main push settles.
Replace angle-bracket placeholders with validated paths; never use a wildcard
branch deletion command.

### 1. Quiesce and snapshot before touching refs

- Wait for the other Codex window to finish its push. Do not run these steps in
  the dirty main worktree while it is writing.
- In the owning session, capture the state and save dirty data outside the
  repository (including untracked paths, without staging generated assets):

~~~powershell
git status --short
git branch --show-current
git for-each-ref --format='%(refname:short) %(objectname)' refs/heads
git worktree list --porcelain
git diff --binary > <RECOVERY_DIR>\main-dirty.patch
git ls-files --others --exclude-standard > <RECOVERY_DIR>\main-untracked.txt
~~~

If the current branch is not `main`, or the dirty patch cannot be recovered,
stop. Do not reset, stash over, or force-checkout the worktree.

### 2. Refresh remote truth in a clean context

First repeat the read-only API checks (`default_branch`, branch tips, PRs, and
rulesets). Then, only after the concurrent push is complete and the worktree is
safe, refresh the local tracking refs:

~~~powershell
git fetch --prune origin
git remote set-head origin -a
git show-ref --heads --remotes
gh api repos/Wutpeach/Ameow/branches --paginate --jq '.[] | [.name,.commit.sha,.protected] | @tsv'
gh api 'repos/Wutpeach/Ameow/pulls?state=all&per_page=100' --jq '.[] | [.number,.state,.head.ref,.head.sha,.base.ref] | @tsv'
~~~

`git fetch --prune` and `git remote set-head` mutate local tracking refs but do
not alter product files. If the refreshed server `main` tip differs again,
rebase/recreate the clean integration worktree; never force the local branch to
an assumed hash.

### 3. Integrate Ripple and remove Lab-only superseded UI on a fresh worktree

Create a temporary branch from the refreshed server `main`; leave the user's
dirty worktree untouched:

~~~powershell
git worktree add -b integrate/fullscreen-ripple-cleanup <INTEGRATION_WORKTREE> origin/main
git -C <INTEGRATION_WORKTREE> show --stat --oneline 818057f664c7474ec1722b143fcc84dcf3ec67e9
~~~

Transplant only the Ripple implementation/tests/fixture paths listed in
`research/ripple-lab-cleanup-plan.md` (use a path allowlist or
`git restore --source=818057f... -- <allowlist>`), then manually resolve the
existing Lab files. The resulting shape is one canonical `lab.html` route,
Ripple as the default Full lane, no `?ripple`/`?ripple=scene` aliases, and no
Intake/Heatmap experiment choices. Keep Download/Transcode/Mixed fixture lanes
if the existing product decision stands, keep Compact, and leave production
Heatmap/Refraction/Intake policy and `ExpandedPresentationSurface` unchanged.
Never transplant `evidence/mr9-ripple/**`, upstream `image-a.png`/
`image-b.png`, or Paper/GSAP material.

Commit the bounded integration only after the focused Ripple/scenario/renderer
tests, repository type-check/lint/build/docs gates, and browser Lab checks in
the cleanup report pass. Include `818057f664c7474ec1722b143fcc84dcf3ec67e9` in
the integration report or commit message. Bring the temporary branch into the
refreshed local `main` with `git merge --ff-only` only when the main worktree is
clean and its tip is the intended post-push base; if fast-forward is refused,
stop and recreate/reconcile rather than forcing history.

### 4. Stop the candidate preview and remove its worktree

Use the terminal that owns the Vite process and send a graceful Ctrl-C. Do not
kill an arbitrary process by port. Verify the listener belongs to the candidate
before terminating it; then ensure the worktree is clean and remove it without
`-f`:

~~~powershell
Get-NetTCPConnection -LocalPort 1421 -State Listen
git -C D:\Ameow\.cindy-worktrees\mr9-ripple-source-fidelity status --short
git worktree remove D:\Ameow\.cindy-worktrees\mr9-ripple-source-fidelity
~~~

If status reports uncommitted candidate work, stop and archive it first. The
preview's evidence files remain task/archive evidence, not Lab assets.

### 5. Preserve every non-main tip, then delete local heads by explicit name

Create annotated tags before deleting any unmerged head. The recommended
scheme is `archive/branch/20260909-<branch-slug-with-hyphens>-<shortsha>`;
replace the tip with the post-integration tip for branches that received new
commits. For the known report tips, the intended mappings are:

~~~text
archive/branch/20260909-lab-mr9-ripple-source-fidelity-818057f -> 818057f664c7474ec1722b143fcc84dcf3ec67e9
archive/branch/20260909-motion-mr9-paper-heatmap-official-baseline-77eb561 -> 77eb5611178a06f7079db29563c9ef75197d7af8
archive/branch/20260909-feat-compact-mascot-depth-occlusion-b9a00ab -> b9a00ab93f15bbaf301e2b129406b0b5f16c69fb (only after dirty work is committed or separately patched)
archive/branch/20260909-chore-trellis-tooling-0.6.15-40d31d3 -> 40d31d38c4e140f389bbb1ba066b58fba3e43a91
archive/branch/20260909-cindy-auto-o3p8cr-3429917 -> 342991724502ff067583d56fd877de9d1e536943
archive/branch/20260909-history-m3-auto-o3p8cr-raw-snapshot-b4acb4a -> b4acb4addc98964b6d019c9874f6b20bd6093da8
archive/branch/20260909-recovery-main-pre-phase4-2b46f91 -> 2b46f91496214a85162593557f38c04267524deb
archive/branch/20260909-repair-diagnostics-readability-export-cleanup-353a798 -> 353a7984174a3d3d6e56a7944b7cb33b1ce5707f
~~~

For each tag, verify that the peeled tag is exactly the captured tip before
deleting its branch:

~~~powershell
git tag -a <ARCHIVE_TAG> <TIP_SHA> -m "Archive <original branch> before local-only-main cleanup"
if ((git rev-parse '<ARCHIVE_TAG>^{}') -ne '<TIP_SHA>') { throw 'archive tag mismatch; abort' }
git show --no-patch --decorate <ARCHIVE_TAG>
~~~

The `-D` fallback is conditional, not a batch command. Check
`git worktree list --porcelain` first so no target head is checked out in
another worktree. For each explicit branch in the table (never `main`), use:

~~~powershell
git merge-base --is-ancestor refs/heads/<BRANCH> refs/heads/main
# exit 0: ordinary merged deletion is sufficient
git branch -d <BRANCH>
# exit 1: stop and verify the archive tag, dirty-work recovery, and authorization
git branch -D <BRANCH>
~~~

The `-D` line is necessary for a bounded Ripple transplant or rejected/
unrelated branches whose original tip is not an ancestor of `main`; the
annotated tag is the rollback proof. Never use `git branch -D --all`,
`git update-ref -d` on broad prefixes, or `git branch -D main`.

### 6. Verify the local-only-main invariant

After the temporary integration branch is fast-forwarded into `main`, remove
that temporary branch using the same tag/ancestor checks. Then assert the
actual heads namespace, not the remote-tracking namespace:

~~~powershell
$localHeads = @(git for-each-ref --format='%(refname:short)' refs/heads)
if ($localHeads.Count -ne 1 -or $localHeads[0] -ne 'main') { throw "local heads are not main-only: $localHeads" }
git branch --format='%(refname:short)'
git show-ref --heads
git worktree list --porcelain
~~~

`origin/*` tracking refs and `archive/*` tags may still exist; they do not
violate `git branch --format='%(refname:short)'`. Close/remove all temporary
worktrees so only the intended main worktree remains for ordinary operation.

### 7. Optional remote cleanup, only after explicit authorization

This is intentionally separate from local branch cleanup. Re-check the server
tip and PR associations immediately before deletion:

~~~powershell
gh api 'repos/Wutpeach/Ameow/branches/motion%2Fpresentation-integration' --jq '{name,sha:.commit.sha,protected}'
gh api repos/Wutpeach/Ameow/compare/motion%2Fpresentation-integration...main --jq '{status,ahead_by,behind_by,merge_base:.merge_base_commit.sha}'
gh api 'repos/Wutpeach/Ameow/pulls?state=all&per_page=100' --jq '.[] | [.number,.state,.head.ref,.head.sha,.base.ref] | @tsv'
~~~

Proceed only if the branch still points to `48987f7...`, compare reports it
fully behind/ancestral to current `main`, no review/release automation refers
to it, and the user explicitly authorizes remote deletion. Then use the targeted
operation and verify the result:

~~~powershell
git push origin --delete motion/presentation-integration
gh api 'repos/Wutpeach/Ameow/branches/motion%2Fpresentation-integration'
git fetch --prune origin
~~~

The expected post-delete API result is HTTP 404. Do not delete `main`,
`origin/main`, `origin/HEAD`, or any docs branch with an open PR. If the API
already reports 404, perform no remote delete; record that it was absent.

## Rollback, reflog, and garbage-collection caveats

- A bounded Ripple transplant may produce new commit IDs, so the original
  `818057f` tip is not necessarily an ancestor of `main`. The archival tag plus
  the integration report is the recovery record; do not mistake a failed
  `git branch -d` for evidence that the work is lost.
- To inspect or recreate a deleted local branch during an authorized rollback,
  use the tag, not an expiring reflog:

~~~powershell
git show archive/branch/20260909-lab-mr9-ripple-source-fidelity-818057f
git branch recovery/ripple-from-archive archive/branch/20260909-lab-mr9-ripple-source-fidelity-818057f
~~~

  Remove the temporary recovery branch after the rollback investigation if the
  local-only-main invariant must be restored.
- For integrated code, prefer `git revert <integration-commit>` on `main` to
  preserve published history. Do not reset or force-push `main` as a cleanup
  shortcut.
- Reflogs can retain deleted branch tips temporarily, but expiry and aggressive
  garbage collection are implementation details. Do not run
  `git reflog expire`, `git gc --prune=now`, or `git prune` as part of this
  cleanup. Keep archive tags and an external dirty patch until the recovery
  window and concurrent push are verified.
- Before any future garbage collection, verify every archive tag with
  `git rev-parse '<ARCHIVE_TAG>^{}'` and preserve the mapping table above. A
  tag that only names an annotated-tag object but peels to the wrong commit is
  not sufficient evidence.

## Decisions still requiring the user/lead

The following are explicit gates, not assumptions hidden in the cleanup runbook:

1. Confirm how the unrelated dirty Compact mascot work is preserved: integrate
   its committed result into `main`, or commit it and retain only an archival
   tag/patch before deleting `feat/compact-mascot-depth-occlusion`. Deletion
   cannot proceed while its changes exist only in the dirty worktree.
2. Confirm that local-only-main means deleting all eight non-main local heads
   after tagging (including rejected Paper, history, recovery, diagnostics,
   tooling, and automation refs). The PRD states this final outcome; the tags
   are the proposed safety mechanism.
3. Explicitly authorize or decline deletion of the server
   `motion/presentation-integration` branch after a fresh fetch/API check. No
   remote Ripple or Paper branch exists in the current API result, and docs
   branches with PRs #5/#6/#7 are out of scope.
4. Decide whether archive tags remain local-only or should be pushed as remote
   recovery refs. The default here is local-only to avoid expanding remote
   history or branch policy without consent.
5. The Ripple UI choices already documented in
   `ripple-lab-cleanup-plan.md` remain lead-owned: retain Download/Transcode/
   Mixed fixture lanes or make Ripple the sole Full chip, remove both query
   aliases unless a documented deep link is required, and hide WebGL2-only
   export while Ripple is selected.

## Caveats / Not Found

- No local Git command, fetch, checkout, merge, branch deletion, tag creation,
  product edit, preview shutdown, or remote mutation was performed in this
  research task. GitHub API calls above are read-only.
- The local report's `ff53f974...` tip was not resolvable by the GitHub compare
  endpoint at query time; this is why the post-push refresh is a hard gate.
- A branch-list API response is not a guarantee about hidden refs, deployment
  automation, or unlisted review systems. Check release workflows and current
  PRs immediately before remote deletion.
- Archive tags preserve commits but not uncommitted files; dirty patches and
  untracked work must be captured separately before branch/worktree cleanup.
