# Performance and resource lifecycle remediation plan

## Goal

Turn the current audit findings into a concrete remediation plan that prioritizes long-running resource lifecycle risks without rewriting stable core flows.

## Confirmed Facts

- The audit output already exists at `PERFORMANCE_RESOURCE_AUDIT.md`.
- This work stays as a single planning task; it will not be split into parent/child tasks during planning.
- The second-wave backlog is intentionally limited to low-risk lifecycle hygiene work only.
- Failed transcode history should be treated as bounded operational state, not unbounded session history.
- Two high-confidence issues were identified in the browser extension background layer:
- `ameowMediaScanCache` previously pruned by age only and had no hard total-entry cap.
- The active-tab media scan flow used `Promise.race(...)` with a timeout timer that was not cleared when the scan completed early.
- A bounded cache helper and focused tests have already been added locally:
- `browser-extension/media-scan-cache.js`
- `browser-extension/media-scan-cache.test.js`
- `browser-extension/background.js` now uses the helper and clears the scan timeout handle after the race resolves.
- Validation already passed for the current local fix set:
- `npm test -- browser-extension/media-scan-cache.test.js`
- `npm test -- browser-extension/generic-video-selection-utils.test.js browser-extension/launcher-config.test.js browser-extension/capture-evidence.test.js`
- `npm run type-check`
- `npm run lint`
- Second-pass evidence collected so far:
- `electron/runtimeLog.mts` already bounds the in-memory buffer (`bufferLimit`) and export reads (`exportedLineLimit`).
- `src/electron-runtime/processRunner.ts` already has explicit abort-driven child-process termination logic, including Windows tree kill fallback.
- `src/electron-runtime/service.ts` keeps failed transcodes in `failedTranscodes`, and that failed queue currently has no explicit retention cap.

## Requirements

- Produce a remediation plan that maps each accepted finding to:
- trigger scenario
- impact
- proposed fix shape
- validation approach
- implementation priority
- Separate:
- already-fixed items
- items that still need implementation
- second-pass backlog items that still require verification before implementation
- items intentionally deferred because evidence is too weak
- Keep the plan constrained to evidence-backed lifecycle risks:
- listener cleanup
- timer cleanup
- process cleanup
- cache bounding / invalidation
- repeated work elimination when clearly demonstrated
- Do not expand the plan into speculative micro-optimization or broad architectural rewrite work.

## Acceptance Criteria

- [ ] `prd.md` captures the remediation-planning goal, confirmed facts, scope, and decision points.
- [ ] The final plan distinguishes fixed issues from planned follow-up work.
- [ ] The final plan explicitly contains a second-pass queue/log/process review backlog section.
- [ ] The final plan treats failed transcode history as capped operational state with explicit validation expectations.
- [ ] Every planned remediation item includes a validation method.
- [ ] The plan explicitly avoids speculative optimization work not supported by repository evidence.

## Out Of Scope

- Unverified performance theories without repository evidence.
- Large architectural rewrites of download, renderer, or window-management flows.
- Complex new caching systems.

## Open Questions

- None at current planning scope.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
