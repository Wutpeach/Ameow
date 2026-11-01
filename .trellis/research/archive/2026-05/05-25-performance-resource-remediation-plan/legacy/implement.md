# Implementation Plan

## Planning Deliverable

This task produces the remediation plan artifacts only. It does not start implementation yet.

## Ordered Checklist

1. Record the current verified fixes as completed-current-wave items.
2. Record inspected non-issues as reviewed/no-change-needed items.
3. Add second-wave backlog entries only where repository evidence exists.
4. For each backlog entry, define:
   - target files
   - fix shape
   - validation command or test shape
   - risk note
5. Review artifacts and confirm they are ready before `task.py start`.

## Current-Wave Completed Items

1. `browser-extension/background.js`
   - bound media scan cache via helper-backed pruning
   - clear media scan timeout after `Promise.race` resolves
2. `browser-extension/media-scan-cache.js`
   - isolate cache pruning logic for focused testing
3. `browser-extension/media-scan-cache.test.js`
   - verify stale-entry pruning and total cache cap behavior
4. `PERFORMANCE_RESOURCE_AUDIT.md`
   - document findings, triggers, impacts, fixes, and validation

## Second-Wave Backlog

1. Failed transcode queue retention
   - Target: `src/electron-runtime/service.ts`
   - Goal: cap `failedTranscodes` as bounded operational state
   - Validation:
     - add service-level tests proving oldest failed rows are pruned after the limit
     - verify `failedCount` and `video-transcode-queue-detail` remain consistent
   - Risk: low, if event names and payload shapes stay unchanged

2. Queue/log/process verification pass
   - Target: `src/electron-runtime/service.ts`, `electron/runtimeLog.mts`, `src/electron-runtime/processRunner.ts`, and directly related tests
   - Goal: confirm no additional low-risk hygiene gaps remain after the failed-transcode retention fix
   - Validation:
     - focused grep/code review notes
     - targeted tests only if a concrete issue is found
   - Risk: low, because this is verification-first and not speculative refactor work

## Validation Commands

### Already run for current worktree

- `npm test -- browser-extension/media-scan-cache.test.js`
- `npm test -- browser-extension/generic-video-selection-utils.test.js browser-extension/launcher-config.test.js browser-extension/capture-evidence.test.js`
- `npm run type-check`
- `npm run lint`

### Expected for second-wave implementation

- `npm test -- <targeted runtime service test file(s)>`
- `npm run type-check`
- `npm run lint`

## Risky Files / Rollback Points

### Low-risk current-wave files

- `browser-extension/background.js`
- `browser-extension/media-scan-cache.js`

### Low-risk second-wave candidate

- `src/electron-runtime/service.ts`

Rollback principle:

- keep retention/cap logic isolated
- do not mix queue lifecycle hygiene with unrelated orchestration changes
- preserve current event contracts so rollback is local and mechanical

## Ready-To-Start Check

- `prd.md` reflects the chosen scope and resolved questions
- `design.md` documents boundaries and compatibility constraints
- `implement.md` distinguishes completed current-wave work from second-wave backlog
- Waiting for user review/approval before `task.py start`
