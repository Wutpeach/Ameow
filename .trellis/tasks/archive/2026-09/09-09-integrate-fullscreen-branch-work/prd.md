# Integrate the approved Ripple Lab and consolidate local branches

## Goal

Integrate the user-approved Ripple checkpoint into the maintained Vite Lab as the sole fullscreen experiment, remove superseded Lab-only Intake/Heatmap experiment UI, preserve unrelated and historical work, and reduce the local branch list to `main` only without changing the production Electron renderer.

## Background

- The accepted production fullscreen chain is already in `main`; no production renderer commit needs replaying.
- The user visually confirmed `lab/mr9-ripple-source-fidelity` at `818057f664c7474ec1722b143fcc84dcf3ec67e9` as the latest desired Ripple effect.
- Ripple is a bounded Lab-only WebGL1 checkpoint. It has no approved live Product scene-source or Electron capture contract.
- The Paper/Heatmap experiment at `77eb5611178a06f7079db29563c9ef75197d7af8` is a final NO-GO.
- The maintained Lab currently carries Intake and Heatmap experiment controls that the user identified as obsolete. Production Intake, Heatmap, Refraction, policy, runtime, shader, and tests remain valid and must stay.
- Four Orca research workers audited active branches, history/recovery refs, remote policy, and Compact task state. Their consolidated result is `research/branch-integration-synthesis.md`.
- The workers observed post-push `main`, `origin/main`, and `origin/HEAD` at `f1b4991c58982fc5a896e61bf58840c2aeec9cfa`. Revalidate before implementation or ref mutation.
- The current `main` worktree remains dirty with unrelated files and a retained 09-07 Compact Lab seam. Those bytes must be reconciled or preserved before overlapping Lab edits begin.

## Requirements

### R1 — Ripple-only fullscreen Lab experience

- Transplant only the allowlisted `src/lab/ripple/` implementation/tests and Ameow-owned fixture from `818057f`; manually adapt the current Lab shell.
- Make Ripple the default Full lane on ordinary `lab.html`.
- Remove `?ripple` and `?ripple=scene`; retain `?theme=white`.
- Preserve Ripple forward, reverse, cancel-to-start/target, phase scrub, origin, and Pinch ON/OFF controls.
- Keep accessible native controls, translated English/Chinese copy, keyboard/focus-visible behavior, deterministic failure UI, Reduced Motion, cleanup, context-loss recovery, and one-pending-rAF bounds.
- Hide the existing WebGL2-only export action while Ripple is selected; do not add a Ripple export adapter.

### R2 — Remove only obsolete Lab experiments

- Remove Lab-only Intake and Heatmap choices, routes/state, presets, locale keys, flags, origin marker behavior, and obsolete tests.
- Retain Download, Transcode, Mixed, Compact, existing Lab geometry/scale/background controls, and production-runtime fixture coverage.
- Keep `ExpandedPresentationSurface`, production Intake/Folder policy, Heatmap/Refraction runtime and shaders, production tests, Product state, Electron wiring, and native behavior unchanged.
- Ensure Ripple and the production Expanded surface are mutually exclusive in the Lab.

### R3 — Source and attribution boundary

- Add Ripple MIT/source-modification attribution to `THIRD_PARTY_NOTICES.md`.
- Do not copy `evidence/mr9-ripple/**`, upstream `image-a.png`/`image-b.png`, Paper files/assets/dependencies, or GSAP.
- Do not promote Ripple into the production Electron renderer or production bundle.

### R4 — Preserve concurrent and Compact work

- Do not reset, stash over, clean, overwrite, or incidentally stage unrelated tracked/untracked files.
- Preserve and commit the validated 09-07 Lab-only frozen-pose seam before Ripple implementation edits overlapping Lab files.
- Archive the 09-07 Compact task as stopped/rejected: the exploration ended, its final geometry was not accepted, and no Architecture PASS is granted.
- Preserve the 09-07 depth patch, C6 rejection evidence, hashes, and lack of Architecture PASS exactly.
- Do not continue Compact geometry research in this task; retain the failed experiments and historical evidence for recovery.
- Treat the completed/archived 09-09 ear-root integration as complete; do not reopen it for geometry refinement.

### R5 — Evidence-backed local branch consolidation

- Revalidate current `main`, local heads, worktrees, ancestry, dirty ownership, and exact tips immediately before ref mutation.
- Treat every non-`main` branch as untrusted exploration, not as an integration unit. Classify its content as approved-and-needed, already covered, or archive-only before staging anything.
- Integrate only the smallest reviewed path/commit subset required for the accepted Ripple and Compact outcomes. Do not whole-merge or broadly cherry-pick an exploratory branch.
- For each non-`main` local branch, either integrate its explicitly approved subset or create and verify an annotated local archival tag at its exact tip; archive-only content must not enter `main`.
- Verify M3 raw-manifest preservation, diagnostics canonical coverage, recovery ancestry, and preview/source worktree quiescence before deleting their branches.
- Delete branches by explicit name only. Use ordinary `-d` for ancestors; use `-D` only for a verified tagged divergent tip under the user-approved local-only-`main` outcome.
- Stop/remove temporary Ripple preview resources only after the maintained Lab integration has passed validation and the source tip is preserved.
- Finish with exactly one local head: `main`. Local archival tags and `origin/*` tracking refs may remain.

### R6 — Remote safety boundary

- Do not delete remote branches or push archival tags in this task.
- Retain remote docs branches with open PRs, `main`, `origin/main`, and `origin/HEAD`.
- Any later deletion of remote `motion/presentation-integration` requires fresh server/PR/ancestry evidence and separate explicit authorization.

## Acceptance Criteria

- [x] Research identifies the strongest fullscreen candidate, exact ref/commit, behavior, affected paths, and reasons it supersedes alternatives.
- [x] Every current non-`main` local branch has an evidence-backed disposition in `research/branch-integration-synthesis.md`.
- [x] The user visually reviewed `818057f` and confirmed it as the desired latest Ripple effect.
- [x] Planning/research performed no branch checkout, merge, commit, push, tag creation, branch deletion, or destructive worktree operation.
- [x] The technical design and ordered implementation/rollback plan name the minimal transplant, conflict boundaries, validation, and cleanup gates.
- [x] An independent Orca `trellis-check` review passed and confirmed that exploratory branches are evidence rather than merge units; the exact local-head execution matrix is self-contained in `implement.md`.
- [x] The 09-07 Compact dirty seam and task status are resolved according to the user's decision without losing historical evidence.
- [x] Ordinary `lab.html` defaults to Ripple and retains `?theme=white`; candidate Ripple query aliases are gone.
- [x] Lab-only Intake and Heatmap choices/state/copy/tests are gone, while Download/Transcode/Mixed/Compact and production Intake/Heatmap behavior remain.
- [x] Ripple controls, WebGL1 lifecycle, context recovery, Reduced Motion, failure UI, keyboard access, translations, and one-scene texture contract pass focused tests and browser checks.
- [x] Production Electron renderer/imports/bundle contain no Ripple code or Lab locale identifiers and pass existing regression gates.
- [x] `THIRD_PARTY_NOTICES.md` records the required Ripple attribution without Paper/GSAP attribution.
- [x] All required tests, type-check, lint, renderer/app/docs builds, and `git diff --check` pass.
- [x] Every deleted local branch tip is recoverable from `main` or a verified annotated local tag; linked dirty worktrees are preserved/reconciled first.
- [x] The final `main` diff contains no rejected experiment code, duplicate implementation, dead route/state/copy/test, candidate-only fixture/evidence, or unnecessary dependency from archive-only branches.
- [x] Final `git branch --format='%(refname:short)'` and `git show-ref --heads` contain only `main`.
- [x] No remote branch is deleted and no archival tag is pushed by this task.

## Key Decisions

- Ripple is Lab-only and becomes the sole fullscreen experiment presented by the maintained Lab.
- Intake/Heatmap cleanup is Lab-only; production policy/runtime/shader behavior is preserved.
- Download, Transcode, Mixed, Compact, the existing Lab shell, and `?theme=white` remain.
- Integration is path-scoped rather than a whole-branch merge because the Ripple commit contains candidate-shell state and current Lab files overlap retained Compact edits.
- Branch deletion and evidence preservation do not imply code integration: rejected, superseded, duplicate, or history-only content remains outside `main` and is recoverable only through its verified archive tag when needed.
- The validated 09-07 Lab-only frozen-pose seam will be committed before overlapping Ripple edits; the 09-07 task will then be archived as stopped/rejected without Architecture PASS or further geometry work.
- Exact divergent tips are preserved through annotated local archive tags; tags remain local.
- The completion invariant concerns local heads only. Remote cleanup is intentionally separate and out of scope.

## Out of Scope

- Reimplementing or redesigning Ripple, adding a second renderer/backend, or adding new dependencies.
- Promoting Ripple into production Electron, adding live production capture, or implementing Ripple PNG export.
- Reintegrating the rejected Paper/Heatmap experiment or superseded M3 Product work.
- Blanket merging or cherry-picking of exploratory branches, and retaining candidate-only scaffolding, assets, tests, routes, copy, or dependencies merely because they exist in a branch.
- Changing Compact geometry, reviving depth/mask/fragment experiments, awarding Architecture PASS, or performing optional future mascot refinement.
- Rewriting or force-pushing published history.
- Deleting remote branches, remote-tracking defaults, open-PR docs branches, or pushing archive tags.

## Risks and Deferred Items

- Dirty Compact/Lab paths overlap Ripple shell edits. Their disposition is resolved, but implementation must preserve and commit the accepted seam before touching overlapping files.
- Archive tags preserve commits, not uncommitted files. Dirty tracked/untracked work requires a commit or independently verified recovery artifact first.
- Worker-observed ref hashes can change. Every destructive decision requires a fresh exact-tip/worktree/ancestry check.
- Native Electron visual validation for Ripple is not required because Ripple remains Lab-only; production non-regression is established through import/bundle/tests.

## Notes

- Treat the user's `mian` spelling as `main`.
