# Design: Ripple Lab integration and local branch consolidation

## Architecture boundary

This task changes the developer-facing Vite Lab and Git recovery topology. It does not change production Electron rendering or Product/Application state.

```text
maintained lab.html
  -> PresentationLab selection
     -> Full / RippleLab (Lab-only WebGL1)
     -> Download | Transcode | Mixed / existing production-reuse fixtures
     -> Compact / existing CompactMascot leaf

production MainWindowPresentationSurface
  -> ExpandedPresentationSurface (unchanged WebGL2 host)
```

Ripple must remain below `src/lab/`. Production code must not import Ripple, its locales, its fixture, or its control vocabulary.

## Source migration

Use a path-scoped transplant from `818057f664c7474ec1722b143fcc84dcf3ec67e9`, not a whole commit/branch merge.

Add and adapt only:

- `src/lab/ripple/RippleLab.tsx`
- `src/lab/ripple/RippleCanvas.tsx`
- `src/lab/ripple/rippleController.ts`
- `src/lab/ripple/rippleSource.ts`
- `src/lab/ripple/rippleResourceCleanup.ts`
- `src/lab/ripple/rippleTextureUpload.ts`
- `src/lab/ripple/rippleController.test.ts`
- `src/lab/ripple/rippleSource.test.ts`
- `src/lab/ripple/rippleIsolation.test.ts`
- `src/lab/ripple/ameow-download-active-200.png`

Manually integrate the current versions of:

- `src/lab/lab-main.tsx`
- `src/lab/PresentationLab.tsx`
- `src/lab/LabOverlayStage.tsx`
- `src/lab/scenarios.ts` and `src/lab/scenarios.test.ts`
- `src/lab/productionRuntimeSemantics.test.ts`
- `src/lab/rendererReuse.test.ts`
- `src/lab/locales/en.json` and `src/lab/locales/zh-CN.json`
- `vite.lab.config.ts` only if comments/examples are stale
- `THIRD_PARTY_NOTICES.md`

Do not transplant review evidence, public A/B images, Paper code/assets/dependencies, GSAP, or production presentation files.

## Selective integration gate

Local branch cleanup is not a merge-all operation. Before any branch contributes bytes to `main`, review the exact diff and classify each candidate path as:

- approved and necessary for the accepted Ripple or Compact outcome;
- already represented by the current `main` or retained worktree state; or
- exploratory/rejected/history-only and therefore archive-only.

Only the first class may be staged. Prefer the existing `main` implementation when behavior is already covered, and reject duplicate abstractions, dead UI/state/copy/tests, candidate fixtures/evidence, and dependencies that serve no accepted behavior. An archive tag is the recovery mechanism for the other classes; it is not a reason to merge them.

## Lab state and routing

- The ordinary `lab.html` route initializes the maintained Lab directly.
- `?theme=white` remains the only relevant query customization.
- Full defaults to Ripple.
- Intake and Heatmap are removed from Lab selection/state/presets/copy.
- Download, Transcode, Mixed, and Compact keep their current fixture/leaf behavior.
- Selecting Ripple mounts exactly one fixed 200x200/r16 WebGL1 canvas and never mounts `ExpandedPresentationSurface` simultaneously.
- The generic export action is hidden for Ripple because the existing export path is WebGL2-specific.

## Ripple lifecycle contract

Reuse the candidate controller and rendering math. Keep one-scene mode, with the Ameow-owned fixture bound to both shader sampler roles. Preserve:

- forward/reverse, phase scrub, origin, Pinch ON/OFF, and cancel destinations;
- one pending animation frame maximum;
- deterministic resize and WebGL context loss/restoration;
- partial-initialization and final resource cleanup;
- Reduced Motion static behavior and zero continuing decorative frames;
- accessible inline failure state if WebGL setup fails;
- translated controls and keyboard/focus-visible access.

Do not add a generic runtime, renderer abstraction, new dependency, production state, or export adapter.

## Compact conflict boundary

The current worktree contains a validated but uncommitted 09-07 Lab-only frozen-pose seam in files that Ripple cleanup must edit. Before implementation:

1. preserve and commit the accepted seam independently;
2. archive 09-07 honestly as stopped/rejected because its final geometry was not accepted;
3. retain immutable depth/C6 evidence and the explicit lack of Architecture PASS;
4. stop Compact geometry research here and preserve failed experiments for historical recovery.

The completed 09-09 behind-head integration stays closed. Ripple implementation must not reopen Compact geometry or OneWorks cleanup.

## Ref preservation and deletion

Ref cleanup happens after code validation and commit, never as part of the transplant.

For each exact non-`main` head:

1. re-read its tip and worktree ownership;
2. prove required bytes are in `main` or another durable artifact;
3. confirm archive-only bytes were not staged into `main`, then create an annotated local tag for any divergent/historical tip;
4. verify `<tag>^{}` equals the captured commit;
5. try `git branch -d <exact-name>`;
6. use `-D` only when divergence is expected, the exact tag/recovery proof exists, and the approved local-only-`main` plan applies.

Special gates:

- Ripple source: integration and focused/browser validation pass; tag `818057f`.
- Ripple preview alias: source tip preserved, preview server stopped, worktree clean and removed.
- Paper: tag `77eb561` as rejected; never integrate.
- Compact feature ref: 09-07 dirty/task decision resolved first.
- Diagnostics: canonical `b9ba0278` coverage and stale task/worktree reconciled.
- Cindy/M3: 32-file raw manifest verified before its worktree is released.
- History: tag exact `b4acb4a`.
- Recovery: final-main ancestry proven; tag exact `2b46f91`.
- Tooling: tag exact `40d31d38`.

The final invariant is `refs/heads/main` only. Archive tags and remote-tracking refs remain.

## Operational sequence

1. Resolve Compact overlap and ensure no other session owns changing paths/refs.
2. Revalidate `main`, `origin/main`, local heads, worktrees, dirty paths, and exact tips.
3. Activate the Trellis task only after the user approves the final plan.
4. Dispatch the implementation worker in the current worktree as required by `AGENTS.md`.
5. Dispatch an independent checker after implementation.
6. Commit only reviewed task paths according to Trellis Phase 3.4.
7. Review the final diff for rejected, duplicate, dead, or candidate-only material before branch cleanup.
8. Preserve/tag and remove preview/worktree resources and local branches one by one.
9. Verify local heads contain only `main`.

## Rollback

- Before deletion, branch recreation must be possible from the verified archive tag.
- If Ripple integration is wrong after commit, revert its integration commit; do not reset or force-push `main`.
- Do not run reflog expiry, aggressive garbage collection, prune-now, wildcard branch deletion, or broad worktree removal.
- If any exact tip, dirty manifest, worktree owner, or tag peel check differs from the plan, stop that branch's cleanup and retain it.

## Remote boundary

No remote branch deletion or archive-tag push occurs here. The remote docs branches have open PRs. Optional cleanup of remote `motion/presentation-integration` is a separate future action requiring fresh API/PR/ancestry evidence and explicit authorization.
