# Diagnose slow Vite Lab loading

## Goal

Identify why `npm run dev:lab` reports Vite ready quickly while the Lab page remains loading, and provide an evidence-backed root cause plus the smallest appropriate remediation options.

## Background

- On 2026-09-10, Vite 8.0.16 reported ready in 465 ms at `http://127.0.0.1:1421/`.
- The client then spent roughly 74 seconds scanning and bundling dependencies.
- `react-router-dom` was optimized first; `clsx`, `image-max-url`, and `tailwind-merge` were discovered later, after which Vite reported that optimized dependencies changed and reloaded the page.
- The observed symptom is that the browser appears to keep loading during this process.
- The user confirmed that the intended `http://127.0.0.1:1421/lab.html` entry is also slow, so the diagnosis must cover the Lab graph's own cold transform cost rather than attributing the entire delay to an accidental `/` navigation.
- The user further confirmed that refreshing `/lab.html` again while the server remains available still produces a long white screen before the Lab UI appears. A one-time cold optimizer explanation is therefore insufficient for the user's real session.
- The user confirmed that Chromium DevTools `Disable cache` is not enabled, eliminating the strongest synthetic reproduction condition from the second research pass; the actual port-1421 server and browser-profile boundary must be measured directly.
- The user confirmed that an Incognito/Guest browser window no longer shows the long white screen. This proves the Lab can render quickly from the same machine and narrows the remaining distinction to transient Vite backlog versus state local to the original browser profile/tab.
- The user then confirmed that the original normal browser window also refreshes quickly. The final diagnosis is therefore a transient cold optimizer/source-transform backlog in the long-lived Vite process, resolved after the graph settled and was warmed; it is not a persistent browser-profile, Ripple/WebGL, HMR, or reload-loop defect.
- The user's Vite log then supplied stronger causal evidence: at 13:55:58 Vite failed the optimizer cache swap with `EPERM` while renaming `node_modules/.vite/deps` to `deps_temp_17ac276f`, recovered one second later, announced newly optimized production-only dependencies (`clsx`, `image-max-url`, `tailwind-merge`), changed the dependency hash, and reloaded clients. Later HMR events targeted production `/src/index.css`, not the Lab stylesheet. This supersedes the backlog-only conclusion: a production-root module graph was active in the shared Lab server, and the global optimizer/cache transition reloaded the Lab client.
- The coordinator's isolated research servers used alternate ports but the same default `node_modules/.vite/deps` cache while the user's 11:18 port-1421 process was alive. That overlap may have contributed to Windows cache-directory contention and must be treated as test-induced interference; all isolated research servers have since stopped.

## Requirements

- Reproduce or otherwise measure the Lab development-server startup and first page load from the current `main` worktree.
- Distinguish server readiness from dependency optimization, browser navigation/reload, module evaluation, asset loading, and runtime rendering.
- Determine why dependencies are discovered in multiple optimizer passes and whether that behavior is expected once, repeats on warm starts, or forms a true reload loop.
- Measure repeated navigations against one long-lived Vite process and separate response/download time, Vite transform time, module evaluation, React mount, and Ripple/WebGL initialization time.
- Inspect the Vite Lab configuration, Lab HTML/entry import graph, dependency cache state, and relevant browser console/network evidence.
- Preserve all existing unrelated dirty files and directories.
- Produce findings only; do not edit application/configuration code, clear caches, install dependencies, or interrupt the user's running Vite/push terminals.
- Recommend the minimum remediation or next diagnostic step, including whether no repository change is needed.

## Acceptance Criteria

- [x] A task-local research report records the measured timeline and exact evidence used.
- [x] The report identifies the dominant cause(s) of the slow visible load and separates expected first-run optimization from any defect.
- [x] The report states whether a second warm start/load is materially faster, when this can be tested without destructive cache changes.
- [x] Any true loop or runtime failure is tied to a concrete config/import/browser symptom rather than inferred only from terminal timing.
- [x] The report gives ranked, minimal remediation options with risks and validation commands.
- [x] No files outside this task's `research/` directory are modified by the research worker.

## Out of Scope

- Implementing a performance fix.
- Deleting Vite caches or reinstalling dependencies.
- Changing production application behavior or the Ripple visual effect.
- Pushing commits, modifying branches/worktrees, or touching remote refs.

## Follow-up Architecture Decisions

- Keep the dedicated Vite multi-page entry at `/lab.html` for previewing integrated Ameow UI states without real downloads. Do not move the Lab into the production router or adopt Storybook for this complete-interface testing goal.
- The next Lab iteration should be automation-first: deterministic agent-driven scenario selection and Playwright visual verification are primary; manual browsing is mainly a final-acceptance workflow.
- Reduce the current Lab chrome and separate scenario identity/fixture data, the production-faithful preview renderer, automation readiness, and optional human controls so tests do not have to drive the manual control panel.
- Preserve a human-facing central control panel so no one must memorize scenario URLs. The panel and automation URLs must read and write the same finite scenario registry and URL state rather than maintaining parallel definitions.
- Default `/lab.html` should open the control panel with a sensible scenario. Selecting a scenario updates a shareable/bookmarkable URL; an automation/capture mode may hide Lab chrome while rendering the same scenario.
- Human scenario changes must be client-side state transitions within the already-loaded Lab. Updating URL query state must use the History API and must not trigger document navigation, module reload, or a new Vite optimizer pass.
- The next Lab's core scope is limited to production-faithful Compact previews with mouse/pointer interactions and production-faithful Fullscreen previews across meaningful application states such as active download and multi-task queues.
- The user confirmed that Ripple is the target visual direction for the next Fullscreen experience and accepted retaining it as the distinctive Fullscreen transition effect. Preserve its approved visual behavior and source-fidelity evidence; do not delete Ripple as obsolete exploration.
- Keep persistent application-state rendering in the production Fullscreen UI: download progress, multi-task queues, transcode, runtime, and error states remain owned by the production presentation/overlay components rather than by Ripple.
- Treat the current standalone Ripple WebGL1 mini-app, duplicated animation authority, experiment-only controls, lane, and fixture asset as migration inputs rather than permanent Lab architecture. The follow-up implementation must integrate only the production-required Ripple transition behavior into the production-faithful Fullscreen renderer, including its appropriate Reduced Motion behavior; remove the standalone experiment shell only after equivalent behavior is reachable through production Fullscreen scenarios and covered by validation.
- Do not combine production Ripple integration with the next Lab restructuring task. First simplify the Lab, establish the finite scenario registry and automation contract, and retain the current Ripple experiment as the approved visual reference. Migrate Ripple during the later production Fullscreen/UI refactor, then remove the standalone experiment shell only after production equivalence is validated.
- Remove `agentation` and the live OneWorks inspector/candidate runtime path in the follow-up implementation, while preserving `@bible-strong/avatar-core` and the production `CompactMascot` path. Preserve archived OneWorks canonical data and review evidence outside the active runtime graph.
- Keep PNG export provisionally until deterministic Playwright capture/readback is established; then evaluate deleting the exporter, `html2canvas`, export UI, tests, and WebGL readback plumbing as one unit.
- Classify retained functionality as core visible controls, automation-only URL/environment parameters, final-manual-acceptance aids, or deletion candidates. Features must not remain solely because the current Lab already contains them.
- Keep this phase discussion/research-only. Any selected restructuring requires a separate implementation task and approval.

## Deferred Work

- A separate Lab implementation task will remove the confirmed obsolete tooling, expose the currently unreachable production Fullscreen fixtures, and add the shared human/automation scenario contract.
- A later production Fullscreen/UI task will integrate the approved Ripple transition behavior. That task, not the Lab cleanup, owns any production renderer or application-behavior change.
- PNG export removal remains conditional on deterministic Playwright capture/readback replacing it as the accepted screenshot path.
