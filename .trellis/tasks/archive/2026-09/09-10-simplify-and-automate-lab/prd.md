# Simplify and automate the Lab

## Goal

Make the browser Lab smaller and deterministic for both people and agents: one finite scenario registry must drive the central control panel, shareable URL state, and automated visual capture while the preview continues to reuse production Compact and Fullscreen presentation components.

## Background

- The approved diagnosis is archived at `.trellis/tasks/archive/2026-09/09-10-diagnose-slow-vite-lab-loading/`.
- `/lab.html` is the intentional browser-only entry. It must stay separate from the production router and Electron runtime.
- The current Lab duplicates scenario identity across Fullscreen lanes and Compact presets, leaves several production fixtures unreachable, and requires automation to drive human-facing controls.
- `agentation` and the live OneWorks inspector/candidate path are no longer part of the desired Lab. `@bible-strong/avatar-core` and the production `CompactMascot` path remain required.
- The standalone Ripple experiment is the approved visual reference for a later production Fullscreen/UI task. This task must preserve that reference without integrating it into production or treating it as a production-faithful application state.

## Requirements

### R1. Preserve the Lab boundary

- Keep `/lab.html` as a plain-browser, development-only entry.
- Do not register the Lab in the production router, import desktop/Electron runtime modules, perform real downloads, or add Storybook or another workbench.
- Continue to derive preview state from typed synthetic fixtures and existing production selectors, projections, and presentation components.

### R2. Use one finite scenario contract

- Define one allow-listed registry for every scenario selectable through the Lab, including production-faithful Fullscreen states, Compact poses/interactions, and the retained Ripple reference.
- The central control panel and URL parser/serializer must consume the same registry; do not maintain parallel scenario definitions.
- Default `/lab.html` to the control panel and a sensible production-faithful scenario.
- Invalid or incomplete URL values must fall back to documented defaults without throwing.

### R3. Make state selection navigation-free

- Selecting a scenario in the control panel must update bookmarkable query state with the History API.
- Human scenario changes must remain client-side state transitions: no document navigation, module reload, or new Vite optimizer pass.
- Support deterministic allow-listed URL inputs for at least scenario, theme, Reduced Motion, and capture mode. Target is derived from the selected scenario rather than represented by a second conflicting source of truth.

### R4. Cover the meaningful production preview surface

- Fullscreen scenarios must expose active download, queued/multi-task, transcode failure, runtime auto-configuration, runtime failure, and mixed states through the production-faithful preview renderer.
- Queue badge/popover and runtime indicator hover/popover must remain reachable with browser-safe callbacks.
- Compact scenarios must preserve the production `CompactMascot`, accepted deterministic preview poses, pointer interaction, and Reduced Motion behavior.
- The renderer must not introduce a second application, pointer, animation, WebGL, or business-state authority.

### R5. Provide an automation-first capture path

- Add one stable readiness marker whose meaning is that the requested registry scenario has committed and its required preview surface is ready for capture.
- Capture mode must render the same scenario as the human panel while hiding non-preview Lab chrome.
- Add one runnable Playwright-based smoke/capture command using the already-installed dependency. It must select scenarios through URL state, wait on readiness, save deterministic screenshots, and verify that scenario changes do not create an extra document navigation.
- The smoke set must include one Compact pointer/pose case and Fullscreen queue, transcode-failure, and runtime-failure cases.

### R6. Remove obsolete active tooling

- Remove `agentation` and its Lab toolbar, package manifest entry, and lockfile entry once active-source consumers are zero.
- Remove the live OneWorks inspector/candidate components, focused tests, package entries, and Lab controls once active-source consumers are zero.
- Preserve `@bible-strong/avatar-core`, `CompactMascot`, and archived OneWorks canonical data/review evidence.

### R7. Keep or delete PNG export as one coherent unit

- First establish deterministic Playwright capture of the combined DOM/WebGL preview.
- If Playwright capture is equivalent for the accepted evidence workflow, remove the PNG exporter, `html2canvas`, export UI/tests/locales, and WebGL readback-only plumbing together.
- If equivalence is not demonstrated, keep the complete exporter and record the concrete missing capability; do not leave a partially removed path.

### R8. Preserve the Ripple migration reference

- Keep the approved Ripple visual behavior, source-fidelity evidence, and reference scenario reachable in this task.
- Do not integrate Ripple into production Fullscreen components, delete its standalone implementation, or change production application behavior here.
- A later independent production Fullscreen/UI task owns migration, Reduced Motion integration, production equivalence, and eventual removal of the standalone experiment.

## Acceptance Criteria

- [x] AC1: `/lab.html` opens the central panel with a valid default production scenario; invalid query values fall back without an exception.
- [x] AC2: Every visible scenario resolves through one registry, and tests prove every registered entry is selectable and every control/URL selection resolves to that same entry.
- [x] AC3: Selecting scenarios updates a shareable URL via the History API without a document reload; automated evidence records one main-frame navigation for the session.
- [x] AC4: Fullscreen queue, transcode-failure, runtime-auto-configuration, runtime-failure, active, and mixed fixtures are reachable and rendered through existing production projections/components.
- [x] AC5: Compact accepted poses, pointer interaction, and Reduced Motion remain deterministic and continue to use `CompactMascot`/`@bible-strong/avatar-core`.
- [x] AC6: Capture mode hides Lab chrome, exposes a stable readiness marker, and the runnable Playwright command captures the four required smoke scenarios without unhandled page/request failures.
- [x] AC7: Active source and package metadata contain no `agentation` or live OneWorks runtime dependency; archived evidence and the retained Compact path are unchanged.
- [x] AC8: The Ripple reference remains reachable and its existing source-fidelity/behavior checks pass; no production Ripple integration is included.
- [x] AC9: PNG export is either retained intact with a recorded Playwright gap or removed as the complete exporter/readback/dependency unit after equivalent capture is demonstrated.
- [x] AC10: Focused Lab tests, `npm run type-check`, `npm run lint`, `npm test`, `npm run build:renderer`, and a production Lab build all pass.

## Out of Scope

- Integrating Ripple into the production Fullscreen renderer or deleting its reference implementation.
- Changing downloader, application, Electron, window, IPC, or production presentation behavior.
- Moving the Lab into the production router, replacing it with Storybook, or creating a generic story/plugin framework.
- Clearing Vite caches, reinstalling dependencies, or treating this restructuring as a separate Vite performance fix.
- Adding pixel-diff infrastructure or a hosted visual-regression service; deterministic screenshots and behavioral assertions are sufficient for this task.
- Public documentation changes unless implementation changes a user-facing workflow.

## Deferred Work

- Production Ripple integration and later standalone-reference removal after equivalence is proven.
- Baseline image diffing or hosted visual regression if screenshot review volume makes it necessary.
