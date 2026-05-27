# Site Profile Diagnostics and Policy Hooks Implementation Plan

## Planning Review Gate

Do not start implementation after Claude review. First present the refined Phase 4 scope to the user for product review and approval.

## Proposed Checklist

1. Decide final diagnostic contract after user review.
   - Recommended: add `get_site_session_diagnostics`.
   - Keep `get_site_session_state` unchanged.
   - Keep the diagnostics contract generic per-site.

2. Add backend diagnostic support.
   - Add profile-state detection to `electron/siteSessionManager.mts` or a narrow helper.
   - Read the stable profile cookie jar and filter to allowed site domains.
   - Return `present`, `missing`, or `unknown` instead of throwing profile-inspection failures.
   - Preserve snapshot readiness and existing state behavior.
   - Add policy evaluation as a pure helper around current required/login cookie config.

3. Wire Electron command/type surface.
   - Add a dedicated diagnostics type in `src/types/siteSession.ts`.
   - Add `get_site_session_diagnostics` to `src/types/electronBridge.ts`.
   - Update `electron/siteSessionCommands.mts` and tests.

4. Update Settings UI.
   - Keep existing site rows and action buttons.
   - Add one compact diagnostic sub-line for profile state and downloader snapshot state.
   - Add localized short labels in `locales/*/desktop.json` and browser-extension mirrored locale files if the existing localization mirror requires it.

5. Update specs.
   - Document the diagnostics contract and policy hook boundary in `.trellis/spec/backend/electron-runtime-contracts.md`.
   - If UI shape is non-obvious, update frontend design/system notes only if a reusable pattern is created.

## Candidate Tests

- `electron/siteSessionManager.test.mts`: profile/snapshot diagnostic states and policy evaluation.
- `electron/siteSessionCommands.test.mts`: diagnostics command routing if a new command is added.
- Regression: `get_site_session_state` still returns the same operational shape.
- Regression: diagnostics after clear/destroy profile returns `unknown` with `lastError` instead of throwing.
- `src/pages/SettingsPage` related tests if this repo already has Settings rendering coverage; otherwise rely on type-check/lint plus manual Electron review.
- `npm run type-check`
- `npm run lint`
- Focused existing site-session tests from Phases 1-3.

## User Review Decisions

1. Defer support-log export. Diagnostics can later feed support logs, but this task should not widen into support-log export work.
2. Add no new speculative site-specific policy. Wrap current config-driven required/login cookie checks behind a policy interface first.
