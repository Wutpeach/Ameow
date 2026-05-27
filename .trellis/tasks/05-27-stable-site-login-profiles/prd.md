# Stable site login profiles

## Goal

Build a sustainable site-login capability around stable, app-owned browser profiles so supported sites do not see every credential refresh as a brand-new temporary browser. The immediate pain is Instagram login verification, but the product direction applies to all current and future supported sites.

The goal is not to build a full anti-fingerprint browser or bypass platform security controls. The goal is to preserve consistent, user-authorized login state, keep downloader cookie extraction explicit, and leave room for later automation.

## Confirmed Facts

- Settings invokes generic site-session commands with `{ siteId }`.
- Current capture uses a new timestamped Electron partition for each fresh capture.
- Current capture extracts cookies into `<userDataDir>/site-sessions/<siteId>.json` for downloader use and destroys the capture partition after confirm/cancel/close.
- Capture windows already strip Electron/Ameow UA tokens, set Accept-Language, deny permissions by default, block non-web navigation, and collect same-site supplemental cookies.
- Download execution injects saved app-owned Netscape cookies when `context.intent.siteId` has a saved site session.
- Download failure classification already has an `auth_required` category that can support a later automatic credential refresh flow.

## Product Requirements

- Use stable app-owned site profiles as the foundation for login continuity.
- Keep downloader credential snapshots separate from the browser profile: the profile is for login continuity; the saved cookie file remains the downloader contract.
- Clearing a site login must remove both the downloader cookie file and the app-owned browser profile for that site.
- Design APIs and internal boundaries so future phases can add automatic cookie refresh, site-specific login policies, and richer profile management without rewriting the MVP.
- Do not reuse the user's default browser profile.
- Do not add arbitrary fingerprint spoofing, proxy rotation, captcha bypass, or attempts to bypass site security policies.

## Phase Plan

### Phase 1: MVP stable profile foundation

Child task: `05-27-mvp-stable-site-login-profiles`

- Replace per-capture timestamped partitions with deterministic per-site app-owned partitions.
- Preserve profiles across confirm/cancel/close.
- Clear profile data when the user clears that site login.
- Preserve existing manual confirmation-based cookie snapshot flow.

### Phase 2: Credential refresh workflow

- Add an explicit "refresh downloader credentials" operation that re-reads cookies from the stable profile without clearing or forcing re-login.
- Optionally surface clearer UI states for "browser profile has login state" vs "downloader cookie snapshot is ready".

### Phase 3: Auth-failure assisted refresh

- On `auth_required` download failure, automatically re-read cookies from the stable profile and retry once when the refreshed snapshot satisfies site rules.
- If refresh fails, prompt the user to manually open the site login window instead of looping.

### Phase 4: Site-specific policies and profile diagnostics

- Add site-level policy hooks only where needed, such as Instagram/YouTube re-auth behavior or provider-specific cookie validation.
- Provide support/diagnostic affordances that explain whether a site has a saved profile, saved downloader credentials, or both.

## Cross-Phase Acceptance Criteria

- [ ] Current and future site login flows are built on stable app-owned profiles, not disposable per-capture identities.
- [ ] Downloader execution continues to consume explicit saved cookie snapshots.
- [ ] Clearing a site login fully removes app-owned remembered state for that site.
- [ ] The implementation leaves a clear extension point for automatic credential refresh after auth-required failures.
- [ ] Specs document the stable profile contract before/when behavior changes.

## Out Of Scope

- Full anti-fingerprint browser features.
- Reusing/importing the user's default Chrome/Edge/Firefox profile.
- Proxy management.
- Captcha, passkey, or platform security bypass.
