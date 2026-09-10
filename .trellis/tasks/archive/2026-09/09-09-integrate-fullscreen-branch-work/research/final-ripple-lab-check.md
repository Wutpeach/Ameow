# Final Ripple Lab integration check

Date: 2026-09-09
Role: `trellis-check`
Source checkpoint: `818057f664c7474ec1722b143fcc84dcf3ec67e9`

## Result

PASS. The approved Ripple Lab integration is confined to the task allowlist, preserves production presentation behavior, and passes the requested tests, builds, browser checks, bundle-isolation scan, and scoped whitespace checks. No design/judgment blocker remains.

## Scope and source audit

- The worktree contains exactly the ten allowlisted `src/lab/ripple/` paths: `RippleCanvas.tsx`, `RippleLab.tsx`, `ameow-download-active-200.png`, `rippleController.test.ts`, `rippleController.ts`, `rippleIsolation.test.ts`, `rippleResourceCleanup.ts`, `rippleSource.test.ts`, `rippleSource.ts`, and `rippleTextureUpload.ts`.
- Blob comparison with `818057f664c7474ec1722b143fcc84dcf3ec67e9` shows the PNG fixture, `rippleSource.ts`, `rippleSource.test.ts`, and `rippleTextureUpload.ts` remain exact. The other six files are deliberate integration/review adaptations for the current Lab shell, single-scene binding, lifecycle cleanup, tests, accessibility, and Reduced Motion behavior.
- The tracked task diff is limited to `THIRD_PARTY_NOTICES.md` and the approved `src/lab/` integration/removal paths. Package manifests are unchanged.
- `npm ls @paper-design/shaders-react @paper-design/shaders gsap --depth=1` is empty. No Paper, GSAP, upstream A/B image, upstream evidence, production import, or unrelated integration path was accepted.
- `THIRD_PARTY_NOTICES.md` identifies the upstream Ripple source file, commit, author, MIT license, and Ameow modifications.
- Pre-existing unrelated dirty paths (`AGENTS.md`, `browser-extension/locales/contract.json`, `electron-builder.config.mjs`, `src/electron-runtime/runtimeDependencyGate.ts`, `.cindy-*`, `.p2v-release-evidence/`, and unrelated package-output trees) were not edited as part of this review.

## Behavior review

- Ripple is the default Full lane. Download, Transcode, Mixed, and Compact remain available, including Compact `previewPose` scenarios.
- Lab-only Intake and Heatmap UI/state/presets/copy/tests were removed. Production Heatmap and Refraction code remains unchanged and present in the production bundle.
- `?theme=white` remains supported and changes the Lab page, workspace, developer-tools, controls, and Ripple shadow tokens. Candidate `?ripple` aliases are absent.
- Ripple and `ExpandedPresentationSurface` are mutually exclusive; the Ripple canvas does not import or mount the production surface. Existing WebGL2 export is hidden and guarded for Ripple but remains available for production-reuse Full lanes.
- The Ripple preview uses one 200×200 Ameow source fixture for both sampler roles, retains the approved shader constants, exposes clamped origin, phase, forward/reverse, both cancel destinations, Pinch ON/OFF, and replacement behavior, and owns one animation-frame chain.
- WebGL allocation/upload failures release partial resources, shared texture identity is deleted once, unmount disposes resources, and context loss/restoration is handled without duplicate listeners or rendering loops.
- English and Chinese Ripple/queue/status/error copy is present. Controls have native keyboard behavior and labels/groups; dynamic state uses `role="status"`; WebGL failure uses `role="alert"`; focus-visible behavior is retained.

## Review fixes

The final review made only local/mechanical corrections inside task scope:

- Removed the unused optional two-scene/A-B fixture/controller state and bound the single Ameow texture to both sampler roles.
- Restored operating-system `prefers-reduced-motion` initialization and reset behavior.
- Fixed synchronous Reduced Motion settlement ordering so forward, reverse, and origin replacement do not overwrite the settled status after the controller settles.
- Made the Lab shell and Ripple shadow follow the active theme tokens, including `?theme=white`.
- Translated the retained queue open/close controls and corrected both Reset hints to describe restoring the system Reduced Motion preference.
- Added minimal regression assertions for one-scene binding, theme-token use, system Reduced Motion wiring, and synchronous settlement ordering.

## Automated verification

| Gate | Result |
| --- | --- |
| Focused Ripple/Lab Vitest command from `implement.md` | PASS — 15 files, 133 tests |
| `npx vitest run src/presentation/main-window src/lab` | PASS — 117 files, 1055 tests |
| `npm run type-check` | PASS |
| `npm run lint -- --quiet` | PASS |
| Explicit Lab build with `vite.lab.config.ts` | PASS — 607 modules |
| `npm run build:renderer` | PASS — 649 modules |
| `npm run build` | PASS — renderer and Electron TypeScript build |
| `npm run docs:build` | PASS — 53 pages |
| Scoped tracked and untracked-source `git diff --check` | PASS |

The production bundle scan found no `Ripple`, `data-ripple`, or distinctive Ripple Lab locale strings. Both `Heatmap` and `Refraction` remain in the production renderer bundle. Vite emitted only the repository's existing browser-externalization and large-chunk warnings; neither is introduced by the Lab-only Ripple code.

## Browser validation

Playwright Chromium validated the explicit Lab build through a temporary local static server at both `lab.html` and `lab.html?theme=white`:

- default Ripple lane and retained Full/Compact lane order;
- no Intake or Lab Heatmap UI;
- exactly one Ripple presentation canvas and mutual exclusion with the expanded production surface;
- hidden Ripple export and retained Download/Transcode/Mixed export behavior;
- retained Compact behavior with no Full canvas;
- 200×200 source geometry and 16px radius;
- keyboard origin editing and visible keyboard focus;
- forward, reverse, both cancellation destinations, phase scrub, Pinch OFF, and representative replacement/lifecycle behavior;
- dark/white theme token differences;
- `WEBGL_lose_context` context loss and restoration;
- system Reduced Motion checkbox initialization and immediate stable target settlement with no continuing animation;
- forced WebGL initialization failure producing the localized accessible alert;
- no page errors during the exercised paths.

The temporary server was stopped after validation.

## Final disposition

The integration is ready for Lead review and commit preparation. This worker did not commit, push, tag, change branches/worktrees, clean refs, or alter unrelated dirty files.
