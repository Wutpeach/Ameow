# Login State Discovery Design

## Summary

Add a full-window lower-left login-state discovery point that lets users enable download-time, site-scoped cookie sync. After opt-in, Ameow does not sync all sites immediately. Instead, each download can resolve the target site, sync only that site's browser cookies through the existing extension path when no ready local snapshot exists, save the snapshot locally, and continue using existing scheduled refresh, advanced-quality refresh, and auth-required retry behavior.

## State Model

Persist two local config flags in `settings.json` through the existing `get_config` / `save_config` path:

- `siteSessionAutoSyncEnabled?: boolean`
  - `true` after the user clicks Confirm in the discovery popover.
  - Enables download-time site-scoped auto sync.
- `siteSessionDiscoveryDismissed?: boolean`
  - `true` after the user clicks Ignore in the discovery popover.
  - Hides only the full-window lower-left discovery point.
  - Does not disable Settings, extension popup, site-session commands, auth-required recovery, or already-enabled auto sync.

Config parsing must tolerate missing/invalid keys and default both flags to `false`.

## Full Window UX

`src/App.tsx` owns the full-window indicator.

- Runtime/bootstrap yellow indicator keeps priority and behavior.
- The blue login-state discovery point appears only in full-window mode, after runtime/bootstrap attention is clear.
- Existing users with dependencies already installed see the blue point on startup unless dismissed.
- The point uses theme accent tokens:
  - center dot: `colors.accentSolid`
  - ring/border: `colors.accentBorder`
  - breathing glow: `colors.accentGlow`
  - emphasized copy: `colors.accentText`
- Clicking opens an in-window popover using the runtime/bootstrap popover surface style. It does not open Settings.
- The discovery popover may be slightly wider than the runtime/bootstrap popover, but should remain a compact non-scrolling surface. Do not add an internal scrollbar for this first-run confirmation. If copy does not fit, reduce copy and move detail to Settings/docs.
- Popover actions:
  - Ignore: persist `siteSessionDiscoveryDismissed: true`, close and hide the blue point.
  - Confirm: persist `siteSessionAutoSyncEnabled: true` and `siteSessionDiscoveryDismissed: true`, close and hide the blue point.

The app popover copy should communicate only the immediate behavior: per-site on demand during downloads. The local-only/no-upload privacy statement is intentionally omitted from the app popover and covered in README/docs instead. Recommended copy:

- zh-CN title: `自动登录态`
- zh-CN body: `下载时按站点同步 Cookies。`
- zh-CN buttons: `忽略` / `启用`
- en title: `Login state`
- en body: `Sync cookies per site while downloading.`
- en buttons: `Ignore` / `Enable`

## Download-Time Sync Flow

Add a runtime hook parallel to the existing advanced-quality refresh hook:

```ts
refreshSiteSessionBeforeDownload?(context: {
  traceId: string;
  siteId: string;
  pageUrl?: string;
  url: string;
}): Promise<void>;
```

Call it after provider planning resolves `plan.intent.siteId` and before `buildExecutionContext(...)` injects saved cookies. If the hook fails, log and continue the download. The existing `auth_required` recovery remains the fallback.

Electron main implements the hook:

1. Read config. If `siteSessionAutoSyncEnabled !== true`, return.
2. Resolve a site-session registry entry for the download:
   - first by URL/domain against registry `primaryHost` and `cookieDomains`;
   - then by exact `siteId` as a fallback.
3. Skip if no registry entry or manager exists.
4. Get current state and decide whether to refresh:
   - For seeded entries with required/login cookie keys, skip when the saved state is `ready` and fresh enough.
   - For catalog entries without required/login cookie keys, do not rely only on `availability === "ready"` because any non-empty cookie snapshot can evaluate ready. Use a short freshness window or attempt a quick refresh for the current download.
5. Request `ensureRefreshed(entry.siteId, { reason: "download_start", onlyIfDue: false, timeoutMs: DOWNLOAD_START_SITE_SESSION_REFRESH_TIMEOUT_MS })`.
6. Treat `null` returns from `ensureRefreshed` as a non-fatal skip, for example extension disconnected or missing manager.
7. On success, existing sync code imports the snapshot, activates `user_sync`, emits state changes, and promotes hidden entries to visible through existing registry activation.
8. On failure or disconnected extension, log and continue without blocking normal download.

`siteSessionRefreshScheduler` needs `RefreshReason` extended with `"download_start"`.
Define a dedicated short timeout constant, for example `DOWNLOAD_START_SITE_SESSION_REFRESH_TIMEOUT_MS` in the 5-8 second range. It should be shorter than the scheduler's default refresh timeout so downloads do not appear stalled.

## Registry And Gallery-Dl Catalog

Eligible targets include:

- seeded site-session entries from `SITE_SESSION_CONFIGS`;
- hidden gallery-dl cookie catalog entries when the current download URL/domain matches the entry. This catalog is a curated cookie-capable subset, not the complete gallery-dl supported-sites list and not a claim that every matching download requires login state.

Do not bulk-sync catalog entries at opt-in.

Important matching detail: `galleryDlSupportedProvider` may produce host-derived `intent.siteId` values, while the registry catalog can use shorter ids such as `patreon`. Download-time sync must use URL/domain matching before exact `siteId`.

Successful sync for a hidden catalog entry records `user_sync` and makes the entry visible/manageable in Settings through the existing registry visibility rules.

## Settings UX

Add the auto-sync control to the existing Settings "站点登录 / Site sessions" page, above the site login badge list.

Recommended structure:

- One compact `NeonCard`, not a new top-level settings page.
- Left side:
  - title: `下载时自动同步登录态`
  - hint: `开启后，下载匹配站点时按站点同步 Cookies。`
- Right side:
  - `NeonToggle` bound to `siteSessionAutoSyncEnabled`
- Below the card, keep the existing site badges. Synced/activated hidden catalog entries appear there through existing registry visibility rules.
- Seeded entries and gallery-dl catalog entries both start hidden. For first-time users, this page may show only the auto-sync card and an empty site badge area until the first matching download saves a session. Do not show empty-state copy; use a subtle horizontal divider between the auto-sync card and the badge area.

The Settings control should not include a long privacy explanation. README/docs carry the local-only/no-upload statement.

## Download Entry Coverage

The feature attaches at runtime provider planning, not at individual UI entry points. Covered video entry paths:

- Dragging a supported video URL into the main window, when it queues through `queue_video_download`.
- Pasting a link into the main window, when it queues through `queue_pasted_video_download` and then the same runtime queue.
- Browser-injected cat buttons, when the extension sends `video_selected_v2` and Electron forwards it to `queue_video_download`.
- Browser extension popup/current-page video actions that use the same `video_selected_v2` or queue-video path.

Non-video paths such as local file/folder drops, direct image saves, and `download_image` are out of scope for this download-time video login-state sync.

Provider planning can identify the site when URL/pageUrl/siteHint matches a built-in provider or gallery-dl-supported provider. If provider planning falls back to generic with no matching site-session registry entry, no cookie sync is attempted.

## Refresh Compatibility

Keep existing refresh mechanisms:

- Scheduled refresh remains TTL/backoff-based and only refreshes activated/saved sessions.
- Advanced-quality refresh remains in place and may continue to be narrowed to its existing site allowlist unless this task explicitly expands it.
- Auth-required recovery remains bounded and retries once after sync.

Download-time sync is an acquisition path. Scheduled refresh is the maintenance path after a snapshot exists.

## Documentation

Update README and docs-site browser-extension/login-state pages:

- cookies are saved locally under app data for downloader use;
- Ameow does not upload cookie/session content;
- enabling the feature does not immediately sync every site;
- cookies are synced per site when the user downloads a matching supported site;
- users can manage saved sessions in Settings.
