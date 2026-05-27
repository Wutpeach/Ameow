# MVP Stable Site Login Profiles Implementation Plan

## Likely Files

- `electron/siteSessionManager.mts`
- `electron/siteSessionManager.test.mts`
- `electron/main.mts`
- `electron/siteSessionCaptureHardening.mts`
- `electron/siteSessionCaptureHardening.test.mts`
- `electron/siteSessionCommands.test.mts`
- `.trellis/spec/backend/electron-runtime-contracts.md`

## Checklist

1. Read the current backend Electron runtime contract and site-session manager tests.
2. Add a deterministic partition resolver for stable site profiles.
3. Update `startCapture()` to use the stable partition.
4. Remove normal-flow partition destruction from confirm/cancel/window-close paths.
5. Update `clearSession()` to delete the saved session file and destroy the stable partition.
6. Make capture-session hardening idempotent per partition so repeated captures do not stack `webRequest` listeners.
7. Keep existing command names and Settings badge click behavior.
8. Update tests:
   - stable partition resolver output
   - repeated captures use the same partition
   - confirm does not destroy profile
   - cancel does not destroy profile
   - window close does not destroy profile
   - clear destroys profile and deletes saved session
   - repeated hardening for the same partition does not duplicate request listeners/supplemental cookie collection
   - existing no-cookie confirm failure behavior still preserves prior snapshot state
9. Update backend spec with the stable app-owned profile contract.
10. Run validation:
   - `npm run type-check`
   - `npm run lint`
   - `npm test -- electron/siteSessionManager.test.mts electron/siteSessionCaptureHardening.test.mts electron/siteSessionCommands.test.mts`

## Manual QA

- Instagram:
  - Open capture.
  - Log in or verify whether the existing app-owned site profile is already logged in.
  - Confirm credentials.
  - Reopen capture and verify it uses the same app-owned profile rather than a fresh temporary browser.
  - Clear site session and verify reopening capture starts from a reset profile.
- Smoke at least one non-Instagram site to confirm the generic lifecycle still works.

## Explicitly Deferred

- Automatic credential refresh.
- Download retry after `auth_required`.
- Separate refresh-only UI.
- Profile diagnostics UI.
- Per-site action menu for view/refresh/clear interactions.

## External Review Notes

Claude Code reviewed the plan and agreed with the overall direction. Adopted must-fix feedback:

- Stable partitions require idempotent capture-session hardening; otherwise repeated captures can stack `webRequest` listeners.
- Normal confirm/cancel/window-close paths must remove all partition destruction, including the close callback path.
- `clearSession()` must call profile cleanup using the deterministic stable partition.
- Tests should include repeated capture cycles and clear-from-idle behavior.
