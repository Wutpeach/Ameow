# Final local branch and worktree cleanup

- Date: 2026-09-10 (Asia/Shanghai)
- Product commit: `12a5f3f02be4d11df546dbc8d878f6d16cb93862`
- Outcome: local heads and Git/Orca worktrees now contain only `main`.

## Recovery gates

- Every branch tip matched the reviewed hash before mutation.
- Diagnostics canonical commit `b9ba0278d9f49d1831f5acbf813448072f53178b`
  and duplicate tip `353a7984174a3d3d6e56a7944b7cb33b1ce5707f`
  reproduced stable patch ID `e1f4967ec5a9f1ca8a60ec0a1d8e5dfc7f6a3264`.
- `b9ba0278`, `2b46f91`, `2bb9a22`, and the accepted production
  fullscreen chain through `0e24a7a` were verified as ancestors of final
  `main` before cleanup.
- The Ripple preview/source, Paper, Diagnostics, History, and Tooling
  worktrees were clean. Port 1421 had no listener.

## M3 dirty-worktree reconciliation

The old 32-file manifest gate correctly stopped the first cleanup attempt.
The original Cindy worktree had evolved from 16 tracked + 16 untracked files
to 16 tracked + 17 untracked files because the M3 task had moved to an archive
path and gained `supersession.md`.

The 25 M3 source/spec paths still matched snapshot commit
`b485d7a0e46020a24e7f4c1c4da86374b6d70b5c` blob-for-blob. The complete current
33-file raw worktree state was then preserved separately:

- Raw-byte manifest: `9aded0bf980e1db3dbdf648f8b1dea86f0437ebc01a62cd94a2a36249e50e6fc`
- Snapshot commit: `38e4cd0ac75bbdd567e09afb42ba68e4decfbbe1`
- Annotated local tag:
  `archive/worktree/20260910-cindy-auto-o3p8cr-dirty-state-9aded0b`
- Recovery: `git stash apply archive/worktree/20260910-cindy-auto-o3p8cr-dirty-state-9aded0b`

The tag was peel-verified and its stash structure enumerated all 33 paths. The
temporary `refs/stash` entry was dropped only after verification; the annotated
tag keeps the snapshot commit and its index/untracked parents reachable.

## Branch archive tags

| Deleted local branch | Reviewed tip | Verified annotated local tag |
| --- | --- | --- |
| `lab/mr9-ripple-source-fidelity` | `818057f664c7474ec1722b143fcc84dcf3ec67e9` | `archive/branch/20260909-lab-mr9-ripple-source-fidelity-818057f` |
| `Wutpeach/mr9-ripple-preview` | `818057f664c7474ec1722b143fcc84dcf3ec67e9` | Same Ripple tag; exact duplicate tip |
| `motion/mr9-paper-heatmap-official-baseline` | `77eb5611178a06f7079db29563c9ef75197d7af8` | `archive/branch/20260909-motion-mr9-paper-heatmap-official-baseline-77eb561` |
| `feat/compact-mascot-depth-occlusion` | `b9a00ab93f15bbaf301e2b129406b0b5f16c69fb` | `archive/branch/20260909-feat-compact-mascot-depth-occlusion-b9a00ab` |
| `chore/trellis-tooling-0.6.15` | `40d31d38c4e140f389bbb1ba066b58fba3e43a91` | `archive/branch/20260909-chore-trellis-tooling-0.6.15-40d31d38` |
| `repair/diagnostics-readability-export-cleanup` | `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` | `archive/branch/20260909-repair-diagnostics-readability-export-cleanup-353a798` |
| `cindy/auto-o3p8cr` | `342991724502ff067583d56fd877de9d1e536943` | `archive/branch/20260909-cindy-auto-o3p8cr-3429917` plus the current worktree snapshot tag above |
| `history/m3-auto-o3p8cr-raw-snapshot` | `b4acb4addc98964b6d019c9874f6b20bd6093da8` | `archive/branch/20260909-history-m3-auto-o3p8cr-raw-snapshot-b4acb4a` |
| `recovery/main-pre-phase4-2b46f91` | `2b46f91496214a85162593557f38c04267524deb` | `archive/branch/20260909-recovery-main-pre-phase4-2b46f91` |

Every tag above was confirmed to be an annotated `tag` object whose peeled
commit equals the reviewed tip. The earlier complete Compact evidence remains
under `archive/compact-mascot-bible-strong-cat-refinement-2026-09-09`.

## Worktree and branch removal

Orca removed the seven exact secondary worktrees and their terminal/layout
resources. Its removal also deleted the preview, Tooling, Cindy, and
Diagnostics local heads after their tags were verified. Orca explicitly
preserved the Ripple source, Paper, and M3 history heads; those and the Compact
head were deleted with exact-name `git branch -D` only after a final tag/tip
comparison. The recovery pointer was an ancestor of `main` and was deleted
with ordinary `git branch -d`.

Final checks:

```text
git branch --format='%(refname:short) %(objectname)'
main 12a5f3f02be4d11df546dbc8d878f6d16cb93862

git show-ref --heads
12a5f3f02be4d11df546dbc8d878f6d16cb93862 refs/heads/main

git worktree list --porcelain
worktree D:/Ameow
HEAD 12a5f3f02be4d11df546dbc8d878f6d16cb93862
branch refs/heads/main
```

No remote branch was deleted, no archive tag was pushed, and the unrelated
dirty files in the main worktree were not staged, reset, stashed, or cleaned.
