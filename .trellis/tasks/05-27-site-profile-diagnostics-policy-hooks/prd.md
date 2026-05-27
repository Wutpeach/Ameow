# Site Profile Diagnostics and Policy Hooks

## Goal

Give users and support workflows a clearer picture of site login state by exposing whether a supported site has a stable browser profile, a downloader credential snapshot, or both. Leave a small, explicit extension point for site-specific credential policy checks without changing the stable profile foundation from earlier phases.

## User Value

- Users can tell whether a site is merely logged in inside the app-owned browser profile or whether a downloader-ready cookie snapshot also exists.
- Support and debugging become easier when a site shows why downloads still fail even though a login session seems present.
- Future site-specific policy rules can be added without rewriting the site-session architecture.

## Confirmed Facts

- Site sessions already persist per-site app-owned Chromium profiles and separate downloader cookie snapshots.
- Settings already has per-site capture, refresh, clear, and badge state for supported sites.
- Download execution already reads the saved Netscape cookie snapshot through `buildExecutionContext(...)`.
- `auth_required` download failures already have a retry path in the runtime and do not need more automatic recovery logic in this phase.

## Requirements

- Expose a per-site diagnostic view of the current site-session state that distinguishes browser profile presence from downloader snapshot readiness.
- Keep `get_site_session_state` unchanged; diagnostics should use a separate explicit diagnostics contract.
- Keep the existing stable app-owned profile contract unchanged.
- Add explicit extension points for site-specific policy checks only where a site truly needs special handling.
- Preserve the existing manual capture / refresh / clear flows and do not add new automatic login behavior.
- Keep the diagnostics compact enough for the current settings UI and avoid a broad redesign.

## Acceptance Criteria

- [ ] A supported site can show whether it has browser profile state, downloader credentials, both, or neither.
- [ ] The diagnostics clarify when a site is ready for download use versus only logged in inside the app-owned profile.
- [ ] `get_site_session_state` behavior and return shape remain unchanged.
- [ ] Profile diagnostics degrade to `unknown` with a captured error when profile inspection fails; Settings load must not fail because diagnostics failed.
- [ ] Settings renders diagnostics as one compact inline sub-line per site row, using existing tones and components.
- [ ] Site-specific policy hooks are present as explicit extension points, but no new per-site special case is hard-coded unless justified by current evidence.
- [ ] Existing capture, refresh, clear, and downloader cookie injection behavior remains unchanged.
- [ ] The resulting task plan is small enough to keep diagnostics and policy work separable from any later UI polish.

## Out Of Scope

- New automatic refresh-after-auth behavior.
- Full profile management UI or deep account inspection.
- Proxy, captcha, fingerprint spoofing, or other security-bypass behavior.
- A broad settings-page redesign beyond the minimum needed to surface the diagnostics.

## Decisions

- Defer support-log export integration. Phase 4 focuses on Settings diagnostics and keeps support-log enrichment for a later supportability task.
- Do not add new speculative site-specific policies. Phase 4 extracts the existing required/login cookie checks behind a policy hook and keeps behavior config-driven.
