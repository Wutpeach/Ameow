## Scenario: Dynamic Site Session Registry And Extension Cookie Sync Contract

### 1. Scope / Trigger

- Trigger: Any task that changes Settings site login state, site-session IPC, browser-extension cookie sync, saved cookie snapshots, or downloader cookie injection.
- Why this needs code-spec depth: The flow crosses Settings UI, typed preload commands, Electron main, browser-extension WebSocket transport, persisted app data, and `yt-dlp` / `gallery-dl` cookie-file execution.

### 2. Signatures

Renderer command names:

```ts
type SiteSessionCommand =
  | "get_site_session_registry"
  | "get_site_session_diagnostics"
  | "get_site_session_state"
  | "sync_site_session_from_extension"
  | "clear_site_session"
  | "get_douyin_session_state"
  | "clear_douyin_session";
```

State and registry payloads:

```ts
type SiteSessionAvailability = "missing" | "partial" | "ready";
type SiteSessionPolicyReason =
  | "ready"
  | "missing_required_cookie"
  | "missing_login_cookie"
  | "no_snapshot";

type SiteSessionRegistryEntry = {
  siteId: string;
  displayName: string;
  labelKey?: string;
  primaryUrl: string;
  primaryHost: string;
  cookieDomains: string[];
  requiredCookieKeys: string[];
  loginCookieKeys: string[];
  syncAuthorization: "seeded" | "user_enabled" | "auto_discovered";
  autoSyncAllowed: boolean;
  discoverySources: Array<
    | "seed"
    | "gallery-dl-supported-sites"
    | "auth_required"
    | "extension_current_tab"
    | "user_sync"
  >;
  engineHints: Array<"yt-dlp" | "gallery-dl">;
  visibility: "visible" | "hidden_catalog";
  icon: {
    kind: "known" | "favicon" | "placeholder";
    key?: string;
    url?: string;
    localPath?: string;
  };
  createdAtMs: number;
  updatedAtMs: number;
};

type SiteSessionState = {
  siteId: string;
  availability: SiteSessionAvailability;
  updatedAtMs: number | null;
  cookieCount: number;
  requiredKeys: string[];
  missingRequiredKeys: string[];
  lastError: string | null;
  sessionFilePath: string | null;
  lastSyncSource: {
    browser: string | null;
    profileLabel: string | null;
    extensionId: string | null;
  } | null;
};

type SiteSessionStateChangedPayload = {
  siteId: string;
  state: SiteSessionState;
  registryEntries: SiteSessionRegistryEntry[];
};
```

### 3. Contracts

- `electron/siteSessionRegistry.mts` is the desktop authority for valid site-session ids, visible login-state rows, allowed cookie domains, required/login cookie markers, sync authorization, and icon metadata.
- `src/site-sessions.ts` remains the seed source for current first-party known entries, but it is not the runtime authority for every valid site id.
- `src/site-session-gallery-dl-catalog.ts` owns the checked-in gallery-dl cookie-auth catalog seed. It must be static build-time data derived from gallery-dl supported-sites metadata; the app must not fetch the gallery-dl GitHub document at runtime.
- Registry entries may be `hidden_catalog`; Settings must not render hidden catalog-only entries until activation promotes them. First-party seed-supported entries and gallery-dl catalog entries both default to hidden catalog metadata until activation.
- The extension may receive hidden entries through `listEntries()` for current-tab matching and approved cookie-domain sync, but it must not render unrelated hidden catalog rows as a default list. Settings-facing registry reads use visible rows only.
- Hidden catalog activation is explicit: successful user sync, current-tab enablement, or `auth_required` discovery may promote an entry to `visibility: "visible"`. Ordinary current-tab relevance must not mutate registry visibility.
- A successful manual/user-initiated cookie snapshot import, including an availability result of `partial`, records the `user_sync` discovery source and promotes the entry to visible. `partial` is a saved-but-incomplete state, not a visibility failure.
- Manual sync promotion is explicit: `electron/siteSessionRegistry.mts` must set `syncAuthorization: "user_enabled"` and `autoSyncAllowed: true` for non-seeded entries when recording a successful user sync. Automated refresh reasons must not create `user_sync` authorization.
- Clearing a saved snapshot removes the `user_sync` activation source and recomputes visibility. If only catalog sources such as `seed` or `gallery-dl-supported-sites` remain, the entry returns to `hidden_catalog`; if `auth_required` or `extension_current_tab` remains, the row stays visible and actionable.
- `electron/siteSessionManager.mts` is snapshot-only. It owns persisted files under `<userDataDir>/site-sessions/<siteId>.json`, `importSnapshot(...)`, `clearSession()`, diagnostics from the saved snapshot, and `getDownloadCookies()`.
- App-owned Electron login/capture windows, capture phases, stable profile partitions, supplemental cookie capture, and profile refresh are removed. Do not reintroduce `start_site_session_capture`, `complete_site_session_capture`, `cancel_site_session_capture`, `refresh_site_session_credentials`, or Douyin capture aliases.
- Browser-extension site-session sync persists into the same saved snapshot shape, including `cookies`, `cookieHeader`, and `cookiesNetscape`; extension cookies must not be attached directly to `video_selected_v2`, pasted-video download payloads, or a separate extension-direct persistent import path.
- Extension popup current-site sync must call the desktop-owned `site_session_sync_request { siteId }` action. Electron then runs the canonical manual refresh path through `SiteSessionRefreshScheduler.ensureRefreshed(..., reason: "manual")` and the existing `site_session_cookie_sync_request/result` bridge.
- Desktop must validate the requested `siteId` against the registry before syncing, pass only registry-approved cookie domains to the extension, and filter returned cookies against the same domains before saving.
- Extension-side sync must reject unsupported site ids before calling `chrome.cookies.getAll(...)`. Phase 1 supports the current seeded site set; later phases replace the extension-local allowlist with desktop-pushed registry validation.
- Browser-extension site-session sync source metadata must be recorded in `lastSyncSource` so Settings can show which browser/extension profile answered the sync request when available.
- Downloader snapshot readiness is evaluated from the saved cookie snapshot through a pure policy helper. Do not add speculative site-specific rules without current downloader evidence.
- `buildExecutionContext(...)` may replace `intent.cookies` with the app-owned Netscape cookie string when `context.intent.siteId` has a saved site-session snapshot. Browser-extension video download payloads must not provide cookies as a fallback.
- Runtime auth-failure profile refresh is removed with the app-owned capture profile. Auth-failure discovery and bounded extension auto-sync belong to the dynamic registry flow, not to silent profile refresh.
- `auth_required` recovery may retry a failed download at most once after extension sync succeeds and a validated saved snapshot contains cookies. Pure `auto_discovered` entries must not trigger automatic cookie reads.
- Main-window site-session pending indicators are removed. Do not reintroduce `get_site_session_pending_actions`, `site-session-pending-actions-changed`, or main-window warning-dot UI for auth-required discovery.
- Settings live-refresh state is driven by `site-session-state-changed`. Electron must emit this event after successful desktop-initiated extension sync and clear-session commands so an already-open Settings window reloads visible rows and state.
- Settings badges are registry-driven site-level pills whose primary visible content is icon, localized/display site name, and one status: `已登录` / `失效` / `未登录` in Chinese or the localized equivalent.
- Settings badge click behavior is unified for every visible registry entry: user-initiated `sync_site_session_from_extension`. The secondary action is `clear_site_session`.
- Legacy Douyin read/clear aliases may remain temporarily for compatibility, but Douyin capture aliases must be removed.

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Unsupported `siteId` in a site-session command | Reject with `Unsupported site session: <siteId>` through registry-backed manager lookup |
| No stored file or invalid stored JSON | Return `availability: "missing"` and `sessionFilePath: null` |
| Stored cookies miss required keys or login marker keys | Return `availability: "partial"` |
| Stored cookies satisfy required keys and at least one login marker key when configured | Return `availability: "ready"` |
| User syncs a visible registry entry from Settings | Desktop requests extension cookies for registry-approved domains and persists a validated snapshot |
| User syncs a hidden catalog entry from the extension current-tab CTA | Popup sends `site_session_sync_request`; desktop validates the registry entry, persists filtered cookies, and promotes the entry to visible with `user_sync` |
| User syncs an `auto_discovered` entry | Persist the snapshot and promote the entry to `syncAuthorization: "user_enabled"` with `autoSyncAllowed: true` and `user_sync` |
| User sync saves cookies but readiness evaluates `partial` | Persist the snapshot, promote the entry with `user_sync`, show the row as incomplete rather than hiding it |
| User merely opens a page matching a hidden catalog entry | Extension may show a current-site sync CTA; Settings remains unchanged and the entry stays hidden |
| `auth_required` matches a hidden gallery-dl catalog entry | Desktop promotes the entry to visible, preserves catalog cookie domains, and may perform bounded auto-sync because catalog entries are seeded metadata |
| `auth_required` discovers a non-catalog unknown site | Desktop creates a visible exact-host `auto_discovered` entry, but does not read cookies automatically and does not show a main-window pending indicator |
| Scheduled/download-start/auth-required/advanced-quality refresh succeeds | Saved cookies and refresh metadata update, but never-manually-synced entries are not marked `user_sync` |
| Site-session saved state changes while Settings is open | Settings receives `site-session-state-changed` with `{ siteId, state, registryEntries }` and reloads panel state |
| Extension is disconnected | Settings command rejects with an actionable browser-extension connection error |
| Browser/profile has no matching cookies | Settings command rejects without crashing and leaves prior snapshot behavior intact |
| User clears a site session | Remove the saved downloader cookie snapshot, remove `user_sync`, recompute visibility, and emit state-change events |
| Downloader context has `siteId` with saved session | Inject saved Netscape cookies into `intent.cookies` |
| Downloader context has no saved site session | Queue without app-owned cookies; extension video download payloads must not synthesize cookies |

### 5. Good/Base/Bad Cases

- Good: A Settings sync for Bilibili requests extension cookies for `bilibili.com` and `b23.tv`, saves `bilibili.json`, and downloader execution later injects the saved Netscape cookie file.
- Good: Existing `site-sessions/youtube.json` remains readable after the registry migration because the snapshot filename and JSON shape are unchanged.
- Good: A hidden Patreon catalog entry is sent to the extension for current-tab matching and `patreon.com` cookie authorization, but Settings does not show it until user sync or auth-required discovery activates it.
- Good: A hidden first-party Bilibili seed entry is sent to the extension for current-tab sync, then becomes visible in Settings after the desktop-owned manual sync path records `user_sync`.
- Good: A non-catalog unknown site discovered by auth failure uses the exact request host as its only cookie domain, stays `auto_discovered`, and does not auto-read cookies until the user syncs it.
- Good: Clearing a Bilibili row with only `seed` + `user_sync` removes `user_sync`, returns the entry to `hidden_catalog`, and causes Settings to drop the row after receiving `site-session-state-changed`.
- Base: YouTube has no strict `requiredCookieKeys`; login marker cookies determine whether synced cookies are complete enough.
- Base: Instagram public content can still download without a saved session; saved sessions only enrich downloader execution when available.
- Bad: Reintroducing an app-owned login BrowserWindow, stable capture partition, or profile refresh path.
- Bad: Letting the extension read cookies for arbitrary desktop-provided domains that are not registry-approved.
- Bad: Rendering the full hidden gallery-dl catalog in Settings or in the extension popup as a default management list.
- Bad: Treating ordinary browsing/current-tab relevance as user consent to read cookies or activate a hidden catalog entry.
- Bad: Reintroducing `site_session_cookie_sync_direct` as a persistent snapshot import path.
- Bad: Reintroducing a main-window site-session pending dot or global login-state auto-sync toggle.
- Bad: Storing only a `Cookie:` header breaks `yt-dlp` / `gallery-dl` cookie-file execution.

### 6. Tests Required

- `npm run type-check`: bridge command names, registry payloads, Settings command payloads, and Electron manager/controller contracts compile.
- `npm run lint`: Settings badge rendering and dynamic icon fallback remain lint-clean.
- Focused tests for registry seeding, hidden catalog visibility/promotion, manual sync authorization promotion, automated refresh non-authorization, clear demotion, auth-required discovery/retry gating, state-change event payloads, snapshot import/filter/clear, command routing, removed-command rejection, extension domain approval/filtering, popup sync routing, and extension request bridge behavior.
- Full `npm test`: existing Electron runtime downloader cookie-file behavior remains green.

### 7. Wrong vs Correct

#### Wrong

```ts
await desktopCommands.invoke("start_site_session_capture", { siteId: "bilibili" });
await desktopCommands.invoke("refresh_site_session_credentials", { siteId: "bilibili" });
```

#### Correct

```ts
await desktopCommands.invoke("sync_site_session_from_extension", { siteId: "bilibili" });
```

#### Wrong

```ts
intent.cookies = "SESSDATA=...";
```

#### Correct

```ts
intent.cookies = storedSession.cookiesNetscape;
```
