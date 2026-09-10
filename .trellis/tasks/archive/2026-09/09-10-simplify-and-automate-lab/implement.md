# Implementation plan: Simplify and automate the Lab

## 1. Establish the baseline

- [x] Confirm current active-source consumers for Agentation, OneWorks, Ripple, `html2canvas`, Playwright, scenario IDs, and exporter readback props; exclude archives and generated/worktree-trash directories.
- [x] Run the focused existing Lab tests before editing and record any baseline failures.
- [x] Confirm archived OneWorks and Ripple evidence paths that must remain untouched.

## 2. Consolidate scenario identity

- [x] Refactor the existing Lab scenario module into the single finite registry; reuse current fixture factories and Compact pose IDs.
- [x] Add the currently unreachable queue, transcode-failure, runtime-auto-configuration, and runtime-failure Fullscreen states.
- [x] Make the panel derive options and selected target from the registry.
- [x] Add one reachability/uniqueness test for all registry entries; remove superseded duplicated lane/preset mapping tests rather than preserving both models.

## 3. Add URL state and capture mode

- [x] Add pure allow-list parsing/serialization for scenario, theme, Reduced Motion, and capture mode with explicit defaults and invalid-value fallback tests.
- [x] Initialize the Lab from that contract and update URL state with the History API on human selection; preserve back/forward only if it remains a real supported interaction.
- [x] Render the same registry entry in panel and capture modes; hide only Lab chrome in capture mode.
- [x] Wire runtime-indicator visibility from the existing projection and add the stable selected-scenario/readiness marker.

## 4. Remove obsolete active tooling

- [x] Remove the Agentation mount/CSS and uninstall `agentation` after an active-source zero-consumer check.
- [x] Remove the live OneWorks inspector/candidate controls, sources, focused tests, locale keys, and packages after an active-source zero-consumer check.
- [x] Verify `CompactMascot`, `@bible-strong/avatar-core`, archived OneWorks evidence, and the Ripple reference remain.

## 5. Add the smallest Playwright capture runner

- [x] Add one Node script using installed Playwright plus built-in assertions; avoid another runner/dependency.
- [x] Run an isolated Lab server, select the required four smoke scenarios through URL state, wait for readiness, assert one main-frame navigation, and fail on unhandled page/request errors.
- [x] Save deterministic screenshots to an ignored or task-local output directory and document the exact command.
- [x] Evaluate combined DOM/WebGL capture. If equivalent, remove the PNG exporter, `html2canvas`, export UI/tests/locales, and readback-only props together; otherwise leave the complete path and record the exact gap.

## 6. Validate and review

- [x] Run the focused Lab suite, including registry, URL, renderer reuse, runtime semantics, Compact pointer/pose, controls, environment, Ripple, and exporter tests if retained.
- [x] Run the new Playwright smoke/capture command and inspect all four images.
- [x] Run `npm run type-check`.
- [x] Run `npm run lint`.
- [x] Run `npm test`.
- [x] Run `npm run build:renderer`.
- [x] Run `npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/09-10-simplify-and-automate-lab/artifacts/lab-build`.
- [x] Confirm no production entry imports `src/lab/**`, no Lab entry imports desktop/Electron code, and human scenario changes cause no document reload.
- [x] Dispatch the Trellis check phase through the required Orca workflow and resolve every finding before completion.

## Rollback points

- Registry/URL changes can revert independently while retaining existing fixtures.
- Obsolete dependency removal must roll back with its source/control deletion.
- PNG exporter removal must roll back as one unit with `html2canvas`, UI, tests, locales, and WebGL readback plumbing.
- Ripple reference and production presentation behavior are outside the deletion boundary.
