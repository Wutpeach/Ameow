# Site Profile Diagnostics and Policy Hooks Design

## Boundary

Phase 4 should improve observability and manual control for site login state. It should not change the Phase 1-3 download recovery behavior:

- Stable app-owned Chromium profiles remain the browser-login continuity layer.
- Saved `<userDataDir>/site-sessions/<siteId>.json` snapshots remain the downloader credential contract.
- `refresh_site_session_credentials` and auth-failure assisted retry remain the refresh primitives.
- Settings remains the user-facing control surface.

## Recommended MVP Shape

Use the existing Settings > Site Logins page as the first diagnostic surface. Avoid a separate diagnostics panel or modal in the MVP.

Each site row should keep its compact badge/action layout and add one small secondary diagnostic line that communicates:

- Browser profile state: whether an app-owned profile likely exists for the site.
- Downloader snapshot state: current `availability`, cookie count, missing required keys when relevant, and last update time.
- Current action affordance: start login, refresh downloader credentials, clear remembered state.

The row should remain action-first: diagnostics explain the state behind the buttons, not long help text. Do not add row expansion, modal detail, or tooltip-only diagnostics in the MVP.

## Backend/Data Contract

The current `SiteSessionState` does not explicitly expose whether the stable browser profile has data. Phase 4 should add a small read-only diagnostic command instead of overloading `availability` or changing `get_site_session_state`.

Recommended shape:

```ts
type SiteSessionProfileState = "unknown" | "missing" | "present";

type SiteSessionDiagnostics = {
  siteId: SupportedSiteSessionId | string;
  profileState: SiteSessionProfileState;
  snapshotAvailability: SiteSessionAvailability;
  snapshotUpdatedAtMs: number | null;
  snapshotCookieCount: number;
  missingRequiredKeys: string[];
  lastError: string | null;
};
```

Recommendation: add `get_site_session_diagnostics` as a generic per-site command.

Rationale:

- Existing `getState()` is fast and snapshot-oriented; adding Electron cookie-jar inspection there would change its performance and failure profile.
- Diagnostics can be explicitly asynchronous and error-tolerant.
- The same contract can later feed support-log export without bloating the operational state command.

Renderer loading should avoid double-fetching when possible: if diagnostics returns snapshot fields too, Settings can derive the row diagnostic from the diagnostics response and keep `get_site_session_state` for capture/control state.

## Profile-State Detection

Do not inspect arbitrary website storage or account details. The diagnostic should only answer whether the app-owned profile partition appears present enough to be useful.

Acceptable approach:

- Electron main asks the site manager for a profile diagnostic using its known stable partition.
- The manager checks lightweight app-owned profile evidence by reading the stable profile cookie jar and filtering cookies to the site's allowed domains.
- Return `profileState: "present"` when at least one relevant profile cookie exists.
- Return `profileState: "missing"` when inspection succeeds but no relevant profile cookie exists.
- Return `profileState: "unknown"` with `lastError` when inspection fails. Do not propagate profile-inspection errors to Settings.

## Policy Hooks

Add policy hooks as pure read-only evaluators around saved cookie/snapshot state. They should explain or classify readiness; they should not mutate profiles, open windows, or trigger refresh.

Recommended minimal interface:

```ts
type SiteSessionPolicyEvaluation = {
  availability: SiteSessionAvailability;
  reason: "ready" | "missing_required_cookie" | "missing_login_cookie" | "no_snapshot";
  missingRequiredKeys: string[];
};
```

Existing required/login-cookie checks can be wrapped behind this interface first. Site-specific policies should be added only when current code already contains site evidence, such as Douyin's required cookie contract or Instagram's `sessionid` marker. Avoid adding speculative YouTube/Instagram heuristics beyond the current config.

The first implementation can extract existing private helper logic from `siteSessionManager.mts`, such as missing required cookie checks and login-cookie checks, into a small reusable policy helper.

## UI Principles

- Keep Settings operational and compact. The page is a repeated-action tool, not a documentation surface.
- Use existing `NeonSection`, `NeonCard`, `NeonButton`, status dot, and theme tokens.
- Render one short localized diagnostic sub-line per site row, for example profile + snapshot readiness.
- Prefer short localized labels such as profile/snapshot/readiness over explanatory paragraphs.
- Use existing ready/muted/danger tones; introduce no new color language.
- Avoid modal-first design. If detail is needed, use inline expansion or a small row detail.

## Compatibility

- Existing command names remain valid.
- Existing `get_site_session_state` return shape and behavior remain unchanged.
- Existing capture/confirm/cancel/refresh/clear behavior remains unchanged.
- Existing downloader cookie injection and auth retry behavior remain unchanged.
- Missing diagnostic support should degrade to `unknown`, not break Settings load.

## Risks

- Profile detection can become misleading if it claims certainty without robust evidence. Prefer `unknown` with `lastError` over a false "present".
- Inspecting a destroyed or never-created Electron partition may fail. The diagnostics command must catch this and return `unknown`, not fail Settings load.
- Adding too much copy to the site rows can make Settings harder to scan. Keep text short and action-oriented.
- Site-specific policy hooks can turn into scattered special cases. Keep the first version config-driven unless evidence requires otherwise.
