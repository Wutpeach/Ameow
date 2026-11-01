# Implementation plan

## Preconditions

- [x] User chose to preserve the validated 09-07 Lab-only frozen-pose seam and close the exploration without accepting its final geometry.
- [x] Preserve and commit the accepted Compact seam. Commit `a6f933b2` contains the maintained seam and selected stopped/rejected evidence; the complete evidence, including reproducible Lab builds, is protected by local annotated tag `archive/compact-mascot-bible-strong-cat-refinement-2026-09-09`.
- [x] Confirm no concurrent Codex/session owns the overlapping Lab files or Git refs.
- [x] Record current dirty paths and revalidate `main`, `origin/main`, `origin/HEAD`, local heads, exact tips, and worktree ownership.
- [x] Record an explicit integration allowlist for each contributing branch; classify every other branch/path as already covered or archive-only before staging.
- [x] Present the final planning summary and receive a subsequent explicit implementation approval.
- [x] Run `task.py start` only after the approval and context-manifest gates pass.

## Exact local-head execution matrix

Treat every hash below as a snapshot to revalidate before use. If any tip differs,
stop that branch's cleanup and update the evidence; never merge a branch merely to
make it deletable.

| Local head | Reviewed tip | Allowed contribution / disposition |
| --- | --- | --- |
| `main` | `f1b4991c58982fc5a896e61bf58840c2aeec9cfa` | Retain. Revalidate with `origin/main` and `origin/HEAD`; never rewrite or delete. |
| `lab/mr9-ripple-source-fidelity` | `818057f664c7474ec1722b143fcc84dcf3ec67e9` | Only the ten Ripple allowlist paths may contribute. Manually adapt current Lab files; after validation, create and peel-verify an annotated local tag at this exact tip, then targeted-delete the branch. |
| `Wutpeach/mr9-ripple-preview` | `818057f664c7474ec1722b143fcc84dcf3ec67e9` | Exact duplicate alias; contributes no bytes. Reconcile/stop its preview resources and remove its clean worktree only after the source tip is tagged, then targeted-delete the alias. |
| `motion/mr9-paper-heatmap-official-baseline` | `77eb5611178a06f7079db29563c9ef75197d7af8` | Rejected Paper evidence; contributes no bytes or dependencies. Tag the exact tip as rejected research, verify the tag, then targeted-delete. |
| `feat/compact-mascot-depth-occlusion` | `b9a00ab93f15bbaf301e2b129406b0b5f16c69fb` | Contributes no branch bytes. First preserve/commit the accepted dirty Lab seam and archive 09-07 as stopped/rejected; then tag the exact branch tip, verify it, and targeted-delete. |
| `chore/trellis-tooling-0.6.15` | `40d31d38c4e140f389bbb1ba066b58fba3e43a91` | Archive-only tooling history; contributes no bytes. Tag, verify, and targeted-delete. |
| `repair/diagnostics-readability-export-cleanup` | `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` | Patch-equivalent archive-only evidence; contributes no bytes. Prove canonical `b9ba0278d9f49d1831f5acbf813448072f53178b` coverage, reconcile/release its worktree, then tag, verify, and targeted-delete. |
| `cindy/auto-o3p8cr` | `342991724502ff067583d56fd877de9d1e536943` | Superseded M3 lineage; contributes no bytes. Verify the complete 32-file raw manifest is durably preserved, then tag, verify, release its worktree, and targeted-delete. |
| `history/m3-auto-o3p8cr-raw-snapshot` | `b4acb4addc98964b6d019c9874f6b20bd6093da8` | Archive-only raw M3 snapshot; contributes no bytes. Tag the exact tip, verify the manifest/disposition remains readable, release its worktree, and targeted-delete. |
| `recovery/main-pre-phase4-2b46f91` | `2b46f91496214a85162593557f38c04267524deb` | Recovery identity only; contributes no bytes. Prove final `main` ancestry, replace the semantic pointer with a verified annotated tag at the exact tip, then targeted-delete. |

Use ordinary `git branch -d <exact-name>` when ancestry permits. Use `-D` only
for that same verified, explicitly named divergent tip after its archive tag and
dirty/worktree gates pass. Do not use wildcard, prefix, bulk, merge-all, or broad
cherry-pick operations.

Remote refs are excluded from this matrix: retain `origin/main`, `origin/HEAD`,
the three open-PR docs branches, and `origin/motion/presentation-integration`.
Do not delete a remote ref or push an archive tag in this task.

## Implementation

- [x] Dispatch a `trellis-implement` Orca worker using the exact model/effort from `.codex/agents/trellis-implement.toml`.
- [x] Transplant only the ten allowlisted Ripple implementation/test/fixture paths from `818057f`.
- [x] Integrate Ripple into the current Lab shell; make it the default Full selection.
- [x] Remove candidate `?ripple` aliases while retaining `?theme=white`.
- [x] Remove Lab-only Intake/Heatmap UI, state, presets, locale keys, flags, and obsolete tests.
- [x] Preserve Download/Transcode/Mixed/Compact and production-reuse fixture behavior.
- [x] Keep Ripple mutually exclusive with the production Expanded surface and hide WebGL2 export for Ripple.
- [x] Add English/Chinese Ripple copy and accessible origin/phase/control behavior.
- [x] Add Ripple MIT/source-modification attribution to `THIRD_PARTY_NOTICES.md`.
- [x] Confirm no review evidence, upstream A/B assets, Paper/GSAP material, or production renderer edits entered the change.
- [x] Review the staged/final diff and remove any rejected experiment, duplicate implementation, dead candidate UI/state/copy/test, unused fixture, or unnecessary dependency that does not support an accepted outcome.

## Focused verification

```text
npx vitest run src/lab/ripple/rippleController.test.ts src/lab/ripple/rippleSource.test.ts src/lab/ripple/rippleIsolation.test.ts src/lab/scenarios.test.ts src/lab/productionRuntimeSemantics.test.ts src/lab/rendererReuse.test.ts
```

- [x] Verify forward/reverse, both cancel destinations, scrub equivalence, origin, Pinch ON/OFF, replacement generation, resize, context loss/restoration, disposal, and one pending rAF.
- [x] Verify one-scene mode binds the same Ameow fixture to both sampler roles.
- [x] Verify Reduced Motion produces a stable static state with no continuing frame work.
- [x] Verify WebGL setup failure fails closed with accessible inline status.

## Repository and browser gates

```text
npm run type-check
npm run lint -- --quiet
npx vitest run src/presentation/main-window src/lab
npm run build:renderer
npm run build
npm run docs:build
git diff --check
```

- [x] Dispatch a `trellis-check` Orca worker using the exact model/effort from `.codex/agents/trellis-check.toml`.
- [x] Inspect `lab.html` and `lab.html?theme=white`: Ripple default, no Intake/Heatmap choices, retained Download/Transcode/Mixed/Compact, focus-visible keyboard access, one Ripple canvas, no simultaneous production canvas.
- [x] Exercise center/off-center/edge/corner origins and lifecycle/recovery behavior.
- [x] Scan built production output to prove Ripple/data attributes/Lab locale identifiers do not enter the production renderer bundle.
- [x] Keep production Intake/Heatmap/Refraction tests and behavior green.

## Commit and local branch cleanup

- [x] Follow Trellis Phase 3.4: present the exact commit grouping and receive confirmation before committing; do not push by default.
- [x] Preserve the Ripple source hash in the integration record and a verified annotated local tag.
- [x] Gracefully stop and remove the temporary Ripple preview resources after the maintained Lab passes.
- [x] For each named non-`main` branch, rerun exact-tip/ancestry/worktree/recovery checks, create/verify required tag, then delete that one branch.
- [x] Confirm archive-only branch content was not merged merely to make its branch deletable; recoverability comes from the verified tag.
- [x] Verify the M3 raw manifest and diagnostics/recovery prerequisites before their branch/worktree cleanup. The stale 32-file gate detected a 33-file current state, which was preserved under a separate verified worktree snapshot tag before cleanup.
- [x] Assert:

```text
git branch --format='%(refname:short)'
git show-ref --heads
git worktree list --porcelain
```

Expected local heads output: only `main`.

## Stop conditions

Stop without deleting the affected branch if:

- an exact tip changed;
- a worktree or session still owns the branch/files;
- uncommitted bytes lack a verified recovery copy;
- an archival tag peels to the wrong commit;
- production renderer files/imports gain Ripple code;
- focused, repository, browser, lifecycle, or bundle-isolation gates fail.

Remote branch deletion and archive-tag push remain out of scope.
