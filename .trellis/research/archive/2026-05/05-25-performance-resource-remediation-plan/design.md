# Design

## Objective

Produce a single remediation design that separates:

- already-implemented low-risk lifecycle fixes
- next implementation wave for evidence-backed low-risk hygiene work
- deferred or verification-only backlog items

This planning task does not introduce a new architecture. It documents how to constrain existing long-lived runtime state without changing user-facing correctness contracts.

## Boundaries

### In Scope

- Browser extension background lifecycle hygiene
- Electron/runtime queue-state retention policy
- Explicit timer/listener/process cleanup where code evidence shows risk
- Validation shape for each remediation item

### Out of Scope

- Queue model redesign
- Download orchestration redesign
- New persistent telemetry/history systems
- Speculative renderer rerender optimization without evidence

## Current State Summary

### Fixed in current worktree

1. Browser extension media scan cache is now bounded.
2. Browser extension media scan timeout timer is explicitly cleared after the scan race settles.

### Already healthy based on current evidence

1. Runtime log controller already limits in-memory buffer size and export read size.
2. Shared process runner already has explicit abort-driven child-process teardown.
3. Renderer event subscriptions inspected in `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/contexts/ThemeContext.tsx`, and `src/i18n/I18nRuntimeBridge.tsx` already use cleanup paths.

### Candidate second-wave backlog

1. `src/electron-runtime/service.ts` failed transcode retention:
   `failedTranscodes` is operational queue state consumed by the UI queue detail/count events. It currently has no explicit cap, so repeated failures in a long session can grow this list indefinitely.

## Design Decisions

### 1. Keep backlog low risk

Only include changes that preserve current contracts:

- same event names
- same queue payload structure
- same basic user recovery actions (`retry`, `remove`)

The acceptable shape is bounded retention or explicit cleanup, not behavior redesign.

### 2. Treat failed transcodes as bounded operational state

`failedTranscodes` is not a durable audit log. It behaves like queue UI state:

- shown in `video-transcode-queue-detail`
- counted in `video-transcode-queue-count.failedCount`
- mutated by retry/remove actions

Therefore the preferred remediation is:

- keep the newest failed items
- drop oldest failed items past a small explicit limit
- preserve retry/remove behavior for retained items

### 3. Distinguish “fixed now” from “backlog to verify”

The final remediation plan should not imply that every audit category still needs code changes. It must clearly separate:

- completed fixes in the current worktree
- concrete next-wave implementation items
- reviewed areas that currently do not justify changes

## Compatibility Constraints

- Do not rename queue or transcode events.
- Do not remove failed queue rows immediately on failure.
- Do not replace runtime log behavior with a new logging system.
- Do not add persistent storage for failed transcode history.

## Validation Model

### Current-wave fixes

- focused browser-extension unit tests
- `npm run type-check`
- `npm run lint`

### Second-wave queue hygiene

- service-level tests confirming failed queue retention cap
- count/detail payload assertions
- UI-facing behavior checks that retry/remove still work for retained rows

## Rollback Shape

- Cache/timer fixes can be reverted independently in browser extension background code.
- Failed-transcode retention cap should be isolated to runtime service state handling so it can be reverted without touching event contracts.
