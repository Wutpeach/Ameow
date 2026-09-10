# Compact seam preservation and 09-07 closure

- Date: 2026-09-09 (Asia/Shanghai)
- Active implementation task: `.trellis/tasks/09-09-integrate-fullscreen-branch-work`
- Closed task: `.trellis/tasks/archive/2026-09/09-07-compact-mascot-bible-strong-cat-refinement`
- Outcome: **validated Lab-only seam preserved; Compact geometry exploration stopped/rejected.**

## Scope result

The retained `previewPose` seam is the accepted narrow contract. `CompactMascot`
uses `renderCompactMascotPreviewScene` only when the optional Lab prop is
defined; otherwise it keeps the existing one-rAF behavior runtime. The Lab
passes deterministic neutral/action samples through the existing Compact
definition/component path, retains Lab-local disposable pointer subscriptions,
and production `MainWindowPresentationSurface` has no `previewPose` caller.

No source correction was required in this phase. The canonical diamond geometry,
the rejected C6 captures, the depth-occlusion experiment, OneWorks tooling, and
the absence of an Architecture PASS remain as recorded; no further Compact
geometry work is authorized under 09-07.

## Exact owned paths

### Preserved pre-existing source seam (not edited in this phase)

- `src/presentation/main-window/CompactMascot.tsx`
- `src/presentation/main-window/compactMascotArchitecture.test.ts`
- `src/lab/CompactPreviewStage.tsx`
- `src/lab/PresentationLab.tsx`
- `src/lab/compactPreviewStage.test.ts`
- `src/lab/lab-main.tsx`
- `src/lab/locales/en.json`
- `src/lab/locales/zh-CN.json`
- `src/lab/oneworksAmeowCandidate.test.ts`
- `src/lab/rendererReuse.test.ts`
- `src/lab/scenarios.ts`
- `src/lab/scenarios.test.ts`

The seam's shared preview runtime and behavior tests are already in `main` and
were not re-edited: `src/presentation/main-window/compactMascotBehaviorRuntime.ts`,
`src/presentation/main-window/compactMascotBehaviorRuntime.test.ts`, and
`.trellis/spec/frontend/character-motion.md`.

### Modified by this phase

- `.trellis/tasks/archive/2026-09/09-07-compact-mascot-bible-strong-cat-refinement/task.json`
- `.trellis/tasks/archive/2026-09/09-07-compact-mascot-bible-strong-cat-refinement/prd.md`
- `.trellis/tasks/archive/2026-09/09-07-compact-mascot-bible-strong-cat-refinement/design.md`
- `.trellis/tasks/archive/2026-09/09-07-compact-mascot-bible-strong-cat-refinement/implement.md`
- `.trellis/tasks/09-09-integrate-fullscreen-branch-work/research/compact-seam-preservation.md`

The supported archive command moved the complete 09-07 task directory from
`.trellis/tasks/09-07-compact-mascot-bible-strong-cat-refinement/` to the
archive path above. Its task record now has `status: completed` and
`completedAt: 2026-09-09`, while explicit metadata records
`closure: stopped_rejected`, `architecture_pass: false`, and
`final_geometry_accepted: false`.

## Evidence and checks

| Check | Result |
| --- | --- |
| Historical depth patch SHA-256 | `B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D` — exact required value before and after archive |
| Focused seam tests | `npm test -- --run src/presentation/main-window/compactMascotBehaviorRuntime.test.ts src/presentation/main-window/compactMascotArchitecture.test.ts src/lab/compactPreviewStage.test.ts src/lab/scenarios.test.ts src/lab/rendererReuse.test.ts src/lab/oneworksAmeowCandidate.test.ts` — 12 files, 184 tests passed |
| TypeScript | `npm run type-check` — passed |
| Lint | `npm run lint` — passed |
| 09-07 manifest validation | passed before archive and at the archived path |
| Seam whitespace | scoped `git diff --check` over the twelve dirty seam paths — passed |
| Archive | `python ./.trellis/scripts/task.py archive 09-07-compact-mascot-bible-strong-cat-refinement --no-commit --skip-branch-validation` — archived successfully; no commit was created |

All archived 09-07 artifacts were inspected as retained evidence. In particular,
the C6/restored Lab capture sets remain rejected/diagnostic evidence, and the
historical patch itself was not edited.

## Remaining dirty worktree paths outside this Compact closure

Tracked unrelated paths:

- `AGENTS.md`
- `browser-extension/locales/contract.json`
- `electron-builder.config.mjs`
- `src/electron-runtime/runtimeDependencyGate.ts`

`git diff --check` still reports only CRLF/trailing-whitespace noise in the
last three paths above. They were not modified or normalized here.

Untracked paths outside this closure:

- `.cindy-upstream/`
- `.cindy-worktrees/`
- `.p2v-release-evidence/`
- `agentation-placement-package-output/`
- `spike-package-output/`

`.trellis/tasks/09-09-integrate-fullscreen-branch-work/` remains the active
task's own untracked artifact tree and is not part of this Compact source seam.

## Approved preservation split for the Lead

The user approved keeping complete evidence outside `main` while retaining the
maintained seam and useful decision evidence in `main`:

1. Create a non-`main` archival commit and annotated local tag
   `archive/compact-mascot-bible-strong-cat-refinement-2026-09-09` containing
   the complete 09-07 archive and this report.
2. Commit to `main` only the twelve preserved seam paths, this report, and the
   09-07 archive excluding the four reproducible generated build directories:
   `artifacts/lab-build`, `artifacts/lab-build-cone-c6`,
   `artifacts/lab-build-final`, and `artifacts/lab-build-restored`.
3. Remove those four generated directories from the worktree only after the
   archival tag is peel-verified and their paths are present in its tree.

Do not include `AGENTS.md`, the three unrelated CRLF-only tracked files, any
`.cindy-*`/`.p2v-release-evidence`/package-output tree, or Ripple/Intake/Heatmap
paths in the `main` preservation commit. The archive is an honest
stopped/rejected closure, not evidence that final geometry, OneWorks cleanup,
or an Architecture PASS was accepted. The archive tag remains local and is not
pushed by this task.
