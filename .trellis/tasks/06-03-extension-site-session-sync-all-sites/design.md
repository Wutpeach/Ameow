# Design: Dynamic extension site-session sync

## Boundary

The task replaces the static, app-window-based site-session model with a desktop-owned dynamic login-state registry and browser-extension cookie sync. It should still preserve the existing saved cookie snapshot contract used by download execution.

The browser extension is an acquisition UI and cookie reader. The desktop app remains the authority for:

- which sites are considered login-state candidates
- which cookie domains are allowed for each candidate
- saved session snapshots
- downloader cookie injection

## Phase Architecture

The implementation is intentionally staged so each layer can be verified before the next expands the surface area:

- Phase 1 establishes the registry as the source of truth and deletes old capture code.
- Phase 2 connects the browser extension UI to registry-approved entries and unknown current-tab enablement.
- Phase 3 wires runtime auth failures into registry discovery and bounded auto-sync.
- Phase 4 stabilizes local icon handling.
- Phase 5 imports a checked-in gallery-dl cookie-needed catalog.

The phases are ordered by dependency. Later phases must not reintroduce a second cookie acquisition path. This Trellis task is not complete until all phases are implemented and verified; phase checkpoints are only intermediate review gates.

## Dynamic Registry

Add a persisted desktop registry, separate from saved cookie snapshots.

Suggested shape:

```ts
type SiteSessionRegistryEntry = {
  siteId: string;
  displayName: string;
  primaryUrl: string;
  primaryHost: string;
  cookieDomains: string[];
  requiredCookieKeys: string[];
  loginCookieKeys: string[];
  syncAuthorization:
    | "seeded"
    | "user_enabled"
    | "auto_discovered";
  autoSyncAllowed: boolean;
  discoverySources: Array<
    | "seed"
    | "gallery-dl-supported-sites"
    | "auth_required"
    | "extension_current_tab"
    | "user_sync"
  >;
  engineHints: Array<"yt-dlp" | "gallery-dl" | "douyin-dl">;
  icon: {
    kind: "known" | "favicon" | "placeholder";
    key?: string;
    url?: string;
    localPath?: string;
  };
  createdAtMs: number;
  updatedAtMs: number;
};
```

Seed entries from current `SITE_SESSION_CONFIGS`, plus Douyin as a must-have cookie site. Existing saved snapshots remain in `site-sessions/<siteId>.json`.

The registry may later ingest gallery-dl's `docs/supportedsites.md` cookie/authentication list, but implementation should avoid making the build depend on live GitHub. Full gallery-dl catalog ingestion belongs to Phase 5 through a checked-in/generated local seed catalog.

Dynamic registry entries mean the registry, not the current static `SupportedSiteSessionId` union, becomes the authority for valid site-session ids. Type and runtime guards should be widened accordingly.

Catalog entries should support a hidden state. A hidden catalog entry is usable for recognition, current-tab matching, safe cookie-domain authorization, and icon metadata, but it is not shown as a normal Settings or extension list row until activated. Activation happens when the user syncs the site, manually enables the current tab, or an auth-required download failure discovers the site.

## Discovery

Runtime auth failure:

1. Download fails with `DownloadRuntimeError.classification === "auth_required"`.
2. Runtime/main derives a candidate from the plan/input:
   - prefer known `intent.siteId` when meaningful
   - else use `siteHint`
   - else derive from URL host
3. Desktop upserts a registry entry.
4. Settings can show the entry.
5. Extension can show the entry when the active tab host matches.

Discovery behavior depends on authorization state:

- Seeded sites may be eligible for automatic sync after auth failure because they are known cookie-needed sites.
- User-enabled unknown sites may be eligible for automatic sync after auth failure because the user explicitly enabled that site.
- Pure auto-discovered sites are added to the registry and surfaced to the user, but should not read cookies automatically until the user enables/syncs them.

Extension current tab:

- Popup asks background for current site-session eligibility.
- Background checks active tab host against the desktop registry over the existing WebSocket.
- If eligible, popup enables a sync button.
- If the active tab is not in the registry, popup shows a manual "enable login-state sync for this site" entry.
- Enabling an unknown site creates a registry entry with the exact active-tab host as the only cookie domain and `syncAuthorization: "user_enabled"`.
- Unknown sites must not expand to eTLD+1 automatically; broader domains require seeded/catalog metadata.

## Cookie Sync Contract

Desktop-initiated sync:

```json
{
  "action": "site_session_cookie_sync_request",
  "data": {
    "requestId": "...",
    "siteId": "...",
    "cookieDomains": ["example.com"],
    "primaryUrl": "https://example.com/"
  }
}
```

Extension-initiated sync from popup:

```json
{
  "action": "site_session_cookie_sync_direct_request",
  "data": {
    "requestId": "...",
    "siteId": "...",
    "pageUrl": "https://example.com/path"
  }
}
```

Registry sync to extension:

- Desktop pushes approved registry entries to connected extension clients on WebSocket connect and registry changes.
- Extension caches the registry entries and validates current-tab/sync actions against that cache.
- Extension-initiated popup sync should use the cached registry to avoid a slow multi-round-trip flow.

The exact action names can be refined during implementation, but the rules are fixed:

- Desktop validates `siteId` against the registry before accepting or sending a sync request.
- Extension must not read cookies for arbitrary user-entered domains.
- Extension reads only registry-approved domains for the selected site.
- Extension returns structured cookie records, not Netscape strings.
- Desktop filters returned cookies against the registry entry and rebuilds `cookies`, `cookieHeader`, and `cookiesNetscape`.
- Cookie values must not be logged.

Auth-failure automatic sync:

- On `auth_required`, desktop upserts or resolves the registry entry.
- If `autoSyncAllowed === true`, desktop may request extension sync automatically.
- Auto-sync uses a short bounded timeout and retries the failed download at most once only if sync succeeds and saves valid cookies.
- If no extension can service the site or sync fails, the download still fails and the registry entry remains visible for manual recovery.
- If `autoSyncAllowed !== true`, desktop must not read cookies automatically; it only surfaces the site in Settings/extension.

For desktop-initiated sync with multiple extension clients, keep the existing first-successful-response behavior.

For extension-initiated popup sync, the sender is already the browser/profile that owns the active tab, so no profile competition is needed.

## UI Design

Settings:

- Replace static `SITE_SESSION_CONFIGS.map(...)` rendering with registry entries.
- Known entries use current known icons.
- Unknown/dynamic entries use a placeholder icon.
- Each row shows status, source/profile metadata when synced, and a sync action.
- Hidden catalog-only entries are not rendered as rows until activated.
- No capture confirmation/cancel state remains.

Main full window reminder:

- Desktop registry exposes a pending login-state action count for entries that are discovered but not synced or user-enabled.
- Main window listens to a dedicated login-state registry event or command payload, not the runtime dependency gate payload.
- The visual treatment should reuse the existing warning/yellow-dot language from the bootstrap indicator area in the lower-left full-window region.
- Clicking or hovering the reminder should route users to Settings > site login state or explain that a site needs browser login-state sync.

Browser extension popup:

- Add a compact login-state/sync panel.
- Show current tab eligibility:
  - eligible and connected: sync button enabled
  - eligible but desktop disconnected: install/open desktop prompt
  - unknown current tab: enable-login-state button with first-party-domain scope
  - discovered-but-unsynced: prominent top CTA to sync login state
- Use hidden catalog metadata to recognize the active tab and enable sync for catalog-backed sites without listing unrelated catalog entries.
- Show a short list of known cookie-needed sites, or link/open Settings for full management.

Browser extension action/badge:

- When the active tab matches a discovered-but-unsynced or beneficial/required registry entry, the extension should show a small attention marker where the browser APIs allow it.
- Popup top copy should mirror that state so users see why the marker appeared.
- If browser action badge APIs are unavailable or visually constrained, the popup CTA remains the required behavior.

Icons:

- Known sites use bundled/generated icons, including simple-icons mappings when available.
- Unknown sites use a placeholder immediately.
- If favicon fetching is implemented, cache the icon locally and store only local metadata for normal rendering.
- UI must not depend on live remote icon URLs to render the list.

## Old Path Deletion

Delete rather than hide:

- app-owned Electron login/capture BrowserWindow path
- capture-phase state and UI
- stable app-owned profile refresh
- supplemental cookie capture
- capture hardening/session modules when no longer referenced
- legacy capture renderer commands and Douyin aliases
- silent auth-refresh retry that depends on `refreshCredentials()`

Keep:

- saved snapshot read/write
- `getDownloadCookies()`
- `importSnapshot(...)`
- `clearSession()`
- download-time cookie injection from saved snapshots

## Security And Privacy

- Discovery may happen automatically from auth failures.
- First-time cookie reading for unknown sites must be user-initiated by enabling/syncing that site.
- Automatic cookie sync after auth failures is allowed only for seeded or previously user-enabled sites with `autoSyncAllowed`.
- Dynamic registry entries default to first-party cookie domains only.
- Cross-site cookie domains require seeded/catalog knowledge.
- No background scanning.
- No arbitrary "enter a domain and read cookies" flow in the MVP.

## Open Technical Risks

- Public suffix/eTLD+1 derivation needs a safe helper or conservative fallback.
- gallery-dl cookie-required metadata may be too broad for the first registry pass, so Phase 5 should use a checked-in/generated catalog and tests rather than live runtime ingestion.
- Hidden catalog matching must be efficient enough for extension current-tab checks and desktop registry queries without sending a huge visible list to the popup.
- Unknown yt-dlp sites cannot reliably be preclassified; discovery is the correct path.
- Extension popup space is tight, so login-state UI must stay compact.
