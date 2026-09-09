# Final bounded stop-condition check

Date: 2026-09-09 (Asia/Shanghai)

## Decision

**The bounded stop condition is satisfied.** The attempted existing-core C6
rounded-cone geometry did not produce acceptable root integration, its failed
evidence is preserved, and the repository has stopped without adding a depth,
mask, clipping, fragment, renderer, or other geometry mechanism.

This is a successful verification of the required stop state, **not** feature
acceptance. The PRD's final cat-readability/root-integration, production-holder,
bounded yaw/pitch, and OneWorks-removal acceptance criteria intentionally remain
unmet.

## Verified final state

### Canonical Compact geometry is restored

- `git diff --quiet HEAD -- src/presentation/main-window/compactMascotDefinition.ts`
  returned `0`.
- `git diff --quiet HEAD -- src/presentation/main-window/compactMascotDefinition.test.ts`
  returned `0`.
- The canonical definition contains exactly two `diamond` nodes with the
  original `76 x 135 x 78`, `[-70, -76, -82]` / `[70, -76, -82]`, and mirrored
  `[0, -5, -10]` / `[0, 5, 10]` values.
- The focused definition test still requires `['diamond', 'diamond']`, exactly
  two behind-head paths, and the same original positions and rotations.
- The active character-motion spec still says "exactly two core-projected
  diamond-ear nodes". An FFF search found no C6, rounded-cone, `tipRoundness`,
  `baseRoundness`, or cone-surface residue in the Compact production directory;
  no rejected cone geometry leaked into product code or active spec.

### OneWorks Lab tooling remains active

- `PresentationLab.tsx` still imports and renders `OneWorksMascotInspector`.
- `OneWorksMascotInspector.tsx`, `oneworksAmeowCandidate.ts`,
  `oneworksMascot.ts`, and their focused tests remain present.
- `package.json` still has the development-only dependencies
  `@oneworks/avatar@1.0.0-rc.6` and
  `@oneworks/avatar-react@1.0.0-rc.6`.
- The OneWorks isolation/candidate/fixture tests passed. The only retained
  candidate-test edit points its read-only fixture at the existing immutable
  archived task path.

This is correct: equivalent **accepted** bible-strong coverage and the cleanup
gate were not established, so removing the inspector, helpers, tests, or
dependencies would overstate completion.

### Lab frozen-pose seam remains bounded

- The optional `previewPose` path renders deterministic neutral,
  `surprised`, `curious-short`, and `playful-short` samples through the same
  canonical definition and avatar-core scene functions.
- Production `MainWindowPresentationSurface.tsx` does not supply
  `previewPose`; with the prop absent, the existing one-rAF behavior runtime is
  still created.
- Lab pointer subscriptions are disposed before a runtime transition or
  unmount.
- Focused tests prove every action preview settles to the neutral scene under
  Reduced Motion, and prove pointer attention changes only eye paths while the
  head and ear paths remain fixed.
- `restored-lab-captures/` contains 24 PNGs: 12 at `81x81` and 12 at
  `241x241`, covering both themes, five frozen/base scenarios, and dedicated
  bounded-pointer samples at 1x and 3x.
- SHA-256 comparisons confirmed all four restored bounded-pointer captures are
  distinct from their theme/scale-matched neutral captures. The capture script
  also fails if the bounded sample leaves the eye paths unchanged.

These captures validate the Lab seam and current eye-attention path only. They
do not claim head yaw/pitch or native production-holder evidence.

### C6 failure evidence is honest and preserved

- `candidate-cone-c6-lab-captures/` contains 24 PNGs with the same two-theme,
  scenario, bounded-pointer, 1x, and 3x coverage shape as the restored set.
- Direct inspection of both white and black 3x captures shows only tiny neutral
  tips, while `curious-short` exposes a conspicuous whole-node lobe on the left.
  This is the expected visual failure of binary whole-node ordering/root
  integration, not an accepted cat-ear result.
- Pixel bounds remain inside the unchanged shell envelope in the checked
  neutral and curious captures for both themes:
  - 1x body bounds: neutral `[17,18]-[62,63]`; curious
    `[14,18]-[62,63]`; shell `[10,10]-[70,70]`.
  - 3x body bounds: neutral approximately `[51,52]-[188,189]`; curious
    `[43,52]-[188,189]`; shell `[30,30]-[210,210]`.
- The evidence remains labeled rejected in `implementation-report.md`, which
  records the Lead rejection message `msg_4676c6a4ae7b`.
- No native-holder screenshot exists. Both active reports explicitly say the
  Electron provider exposed no visible window and that Lab screenshots are not
  a substitute; no native-holder capture is claimed.

### Official `pig--pink-pig` report reproduces

The report's pinned GitHub Contents API URL was fetched again during this
check. It returned:

- path: `src/avatarPresetSnapshots/breeds/pig--pink-pig.svg`
- size: `56,900` bytes
- API blob SHA: `4dac35833dcf7be98d07e1d0f2c168cce52aba7e`
- independently recomputed Git blob SHA:
  `4dac35833dcf7be98d07e1d0f2c168cce52aba7e`
- `data-avatar-entity-preset="pig"`: present
- `production-pig`: present
- download URL pinned to revision
  `9792d24dcdadb13b960757f4352e3fc11bb11130`: yes

The report correctly limits use to a visual reference and does not claim the
built-in snapshot matches the user's unavailable original share/custom state.

### Historical evidence remains unchanged

The preserved historical patch still hashes to:

```text
B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D
```

This matches `task.json`, the planning review, the implementation report, and
the preceding check report. No historical or archived file was edited.

## Verification

- Focused Compact/Lab/OneWorks/import-guard tests: **pass** — 24 files, 325
  tests.
- `npm run type-check`: **pass**.
- `npm run lint`: **pass**.
- `python ./.trellis/scripts/task.py validate
  .trellis/tasks/09-07-compact-mascot-bible-strong-cat-refinement`: **pass**.
- Task-scoped `git diff --check`: **pass**.
- Historical SHA-256 check: **pass**.

## Worktree classification

The task-related tracked diff is limited to the retained frozen-pose Lab seam,
its tests/locales, the archived fixture read-path correction, and the matching
character-motion spec update. The canonical definition and definition test are
unchanged.

The pre-existing changes in `browser-extension/locales/contract.json`,
`electron-builder.config.mjs`, and
`src/electron-runtime/runtimeDependencyGate.ts` are line-ending-only under
`git diff --ignore-space-at-eol` and still make global `git diff --check`
report CRLF trailing-whitespace noise. They and the unrelated untracked
`.cindy-*`, `.p2v-release-evidence/`, `agentation-placement-package-output/`,
and `spike-package-output/` trees were left untouched.

## Stop-condition judgment

PRD R3 explicitly requires preserving evidence and stopping if existing
avatar-core capabilities cannot produce acceptable root integration. C6 stayed
inside the existing body-node/shared-pose path, stayed within the shell, and
still failed visually because the neutral tips are too small and the curious
pose exposes a whole-node lobe. Restoring the original diamonds, retaining the
useful Lab seam and failed evidence, declining OneWorks cleanup, and refusing a
new geometry mechanism is therefore the correct bounded outcome.
