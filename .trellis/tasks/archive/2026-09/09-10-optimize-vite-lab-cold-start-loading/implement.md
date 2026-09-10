# Execution plan: Optimize Vite Lab cold-start loading

## State and coordination

- User approved the minimal candidate and task was activated on 2026-09-10. Branch: `fix/vite-lab-cold-start`. The initial attempts failed acceptance; the approved revision and evidence-directed watcher correction now pass the final independent gate. Implementation, validation and spec sync are complete; commit confirmation and archive/journal remain pending.
- Orca Run: `run_14edb4580230`; reuse for related phases when available.
- Research Task `task_f1895cece99e`, Dispatch `ctx_ae45777aa0c9`: succeeded; report reviewed, worker released, Delivery `delivery_8b5cc56fb202` acknowledged.
- Implementation Task `task_59c4899c88c4`, Dispatch `ctx_8745eac0a4fd`: failed runtime acceptance; report in `evidence/implementation-report.md`, worker released, completion acknowledged.
- Independent review Task `task_8cd38c22c588`, Dispatch `ctx_7e4c874a6133`: review succeeded, implementation acceptance remains failed. See `evidence/check-report.md`; worker reused for mechanical evidence/cleanup corrections under Task `task_fcc275836e1f`, Dispatch `ctx_7915e4c3e976`.
- Reviewer TOML has no active model/effort assignments (only commented examples); reviewer launch therefore inherited configured Codex defaults.
- Corrective check Task `task_fcc275836e1f` succeeded; see `evidence/cleanup-report.md`. Worker released and Delivery `delivery_b5b132008100` acknowledged. No expected dispatch remains unsettled. Corrected browser assertions have not been rerun; only focused cleanup, syntax, lint and type-check were validated.
- Follow project Orca dispatch rules. Read the implementation/check TOML before each phase and use its exact model/effort. Workers must not spawn workers. Get the active Trellis path from `task.py current` for each dispatch.

## Ordered work

- [x] After planning approval, activate with `task.py start` and dispatch implementation through Orca.
- [x] Record a comparable baseline before editing. Use an owned test server/port and browser with normal caching. Record existing cache state; do not disturb the user's running servers or shared cache.
- [x] Make the three changes in `design.md`: Lab cacheDir, Lab-only scan entry, and npm script open target. Verify every caller, particularly capture.
- [x] Use the existing Playwright dependency and Lab DOM markers for one small runnable acceptance check retained with task evidence. Avoid a new framework or general benchmarking system. It must record cold/warm timings, prove scenario interaction and report browser errors; reuse the current capture smoke for scenario rendering.
- [x] Validate with actual browser visibility (not merely DOM attachment), screenshot/trace and an enabled scenario click that updates selection/URL without an extra document navigation. The research report's attached DOM milestone alone is insufficient for first visible UI.
- [x] Run the cold, warm and concurrent matrix below; preserve exact commands and logs. If the candidate fails a gate, report evidence and revise the plan before expanding scope.
- [x] Run appropriate static/capture checks and independent Orca review; update the existing Lab spec with verified contracts.
- [x] User confirmed the commit plan on 2026-09-11; task-owned source/spec committed as `c8872ff4`. Archive and journal follow under the same authorization.

## Required evidence matrix

| Case | Evidence and pass conditions |
| --- | --- |
| Cold before/after | Same machine, dependency versions and browser cache policy; recorded cache state or controlled empty test cache. Record process launch, ready, HTML response, first visible workspace and first successful scenario interaction. Save log plus screenshot/trace. Compare like-for-like measurements; label historical 390 ms / 26.8 s separately. No repeat of the reported prolonged optimizer blockage. |
| Warm refresh | At least two reloads in the same process/context with ordinary caching. Record visible/interactive times and normal scenario behavior. No continuous bundling, unexpected reload loop or browser failures. |
| Ordinary Vite + Lab | Different effective cacheDir values; both processes load/refresh normally. Lab stays on `/lab.html`; no EPERM/EACCES or unexpected production dependency discovery. |
| Two Lab instances | Distinct ports, recorded actual cacheDir values, overlapping cold/forced optimizer activity in test-owned paths where safe. Both visible and interactive; repeated refreshes without cache swap errors, missing optimized modules or cross-instance reloads. Do not infer safety from a warm-cache run that performs no writes. |
| Entry and capture | Resolved entries equal `["lab.html"]`; `npm run dev:lab` opens `/lab.html`; direct capture invocation does not auto-open another window. Existing capture scenarios still render. |

## Checks

- `npm run type-check`
- `npm run lint`
- `npm run lab:capture -- --output <task-local-evidence-directory>` (confirm the existing script invocation before running)
- The retained small browser acceptance check, with its exact invocation documented in the final evidence report.
- `npm run docs:build` only if public docs content changes.

Record pre-existing failures separately; do not fix unrelated worktree changes. Avoid artificially prewarming the measured cold route: the current capture script fetches `/lab.html` before browser navigation, so its screenshot timing alone cannot serve as the cold browser result. Record cold process-start-to-UI time as well as browser navigation timing, and account for automatic browser opening in the protocol.

## Completion report

Provide changed paths, commands, environment, before/after timing table, effective cache paths, browser evidence and concurrent-process logs. Identify limitations explicitly. A passing ready line is never sufficient completion evidence; historical and new measurements must retain their distinct conditions.

## Historical attempt outcome and next gate

Fresh measurements now exist from implementation, but their limitations are recorded in `evidence/check-report.md`: before/after cache conditions differ, the HTML response label actually measured DOMContentLoaded, preview visibility and warm error assertions are incomplete, and the initial npm-process cleanup left residual children. Do not erase old raw evidence or retroactively relabel it as a corrected experiment. The reported 28.569 s versus 27.223 s process-to-workspace results are observations, not a demonstrated performance improvement or transform-root-cause diagnosis.

One fully logged forced two-Lab run produced a real EPERM swap error in the common Lab cache and failed to show workspace within 120 seconds. This fails the approved concurrency gate. Static checks passed, but no completed-task commit/archive is appropriate.

The next product design must isolate Lab instances while preserving normal restart cache reuse. See the proposed revision in `design.md`; implementation of that material revision requires review. Mechanical harness corrections and reclaiming proven test-owned processes are cleanup within the current authorization.

Revision approval received on 2026-09-10: implement the stable-port instance-cache design and accurate phase diagnosis in `design.md`. Existing role/context requirements still apply; keep product changes bounded and reuse the corrected evidence runner.

## Approved revision execution record

- Port isolation implementation: Task `task_e1831121355f`, Dispatch `ctx_3b18844ff00e`, report `evidence/revision-implementation-report.md`; completed and released. Distinct-port cache integrity passed but cold/warm timing remained slow.
- Revision review: Task `task_e6027da3693c`, Dispatch `ctx_ebc101db99c0`, report `evidence/revision-check-report.md`; review completed, worker reused. Corrected capture path/exit checks and exact known-warning classification. Performance acceptance remained failed; arbitrary same-port/different-host, port-zero and strictPort overrides are not claimed supported by port identity.
- Representative-cache profile: Task `task_4dfd2444654a`, Dispatch `ctx_1799edcfa448`, report `evidence/profile-report.md`; settled failed because buffered server/ELU telemetry was lost, worker released. Valid CPU sampling and browser timings survived. Native watcher registration accounted for about 85% of sampled elapsed time; this is not pure CPU usage. No runtime product edits occurred in the profile task.
- Watcher correction: Task `task_8bb7d0bb17f6`, Dispatch `ctx_83dfd91252a1`, completed successfully on the same Run; see `evidence/watcher-implementation-report.md`. Role/model: trellis-implement, gpt-5.6-terra/xhigh; terminal `term_7c2e92c5-2d36-48e9-a257-abf11781060c`. Ownership is Lab watch exclusions plus task-local verification; no renderer/dependency or production config changes.
- Watcher inventory escalation `msg_f208301f0315`: first probe reached 149,016 process handles without a persisted directory summary after five minutes; worker stopped verified PID 12452. Lead approved only one short incremental registration-path sample with a parent-enforced deadline, not another full watcher-ready wait. Delivery `delivery_dc80201f3c69` was replied to and acknowledged; continue one filtered lifecycle wait until the expected Dispatch settles.

Cleanup completed: proven test PIDs 54848 and 47632 were identity-checked and are absent; PID 36856 / port 64699 was left untouched because independent ownership was not established. The runner has accurate navigation labels, actual-cache records, stronger browser assertions and tested process-tree shutdown. Future passing acceptance still needs concurrent reload coverage and a matched source baseline. No runtime success is inferred from the corrected script's static checks.

## Final accepted state

- Final check Task `task_a0eb97ab4a8e`, Dispatch `ctx_bc7dc72648b5`: PASS; report `evidence/final-check-report.md`, worker released and delivery acknowledged. This supersedes the historical open acceptance statements above for the final source.
- Spec follow-up Task `task_966031d54172`, Dispatch `ctx_bfd5e056d314`: succeeded; report `evidence/spec-update-report.md` reviewed, worker released, Delivery `delivery_eae9e7d669c8` acknowledged. No expected dispatch remains unsettled or reclaimable.
- Matched navigation-to-visible: 28.851 s → 1.138 s; launch-to-visible: 29.265 s → 1.487 s. Warm visible: 22.728 / 17.875 s → 0.209 / 0.076 s. Both concurrency matrices, CSS HMR, restart reuse, five capture scenarios, lint and type-check pass.
- Supported evidence is Windows loopback with fixed positive distinct ports and strictPort; layout visibility is not a compositor-paint measurement. Preserve all limits in the final check report.
- Task remains in progress solely for Phase 3.4 commit confirmation and subsequent archive/journal. Unrelated dirty files and unproven process ownership remain untouched.

## Closure

User authorized commit and archive on 2026-09-11. Work commit: `c8872ff4` (`fix(lab): isolate Vite caches and reduce startup watchers`). Source hashes still match the independently accepted final evidence; scoped whitespace checks pass. All earlier pending-approval statements are historical. Archive this task and record the journal; do not push or include unrelated work.
