# Conditionally refresh site session before advanced quality probe

## Goal

Reduce cases where advanced-quality probing on supported logged-in sites returns a downgraded subset of qualities because the desktop-owned saved site session is stale while the browser is already logged in.

This task is a focused follow-up to `06-10-right-click-advanced-quality-selection`. It does not change the user-facing “同步” wording or introduce a new settings toggle. It strengthens the existing site-session capability for advanced-quality probing.

## Requirements

### User-facing scope

- Keep the current site-session wording as “同步”.
- Do not add a new settings switch, one-time arm state, or separate “auto refresh cookies” feature surface.
- Treat this as an internal enhancement of the existing synced login-state behavior.

### Functional behavior

- When an advanced-quality request is triggered on a site that already has synced site-session support, desktop should be able to refresh the site session before probing under defined conditions.
- V1 scope should stay narrow:
  - prioritize YouTube
  - prioritize Bilibili
  - prioritize the advanced-quality probe path only
- Existing auth-required retry behavior remains valid as a fallback and should not be removed.

### Preferred first trigger condition

- Before running advanced-quality probe on a supported site, if the site supports desktop-managed session sync and the saved snapshot is stale, attempt one background site-session sync first.
- The sync should reuse the existing extension-based site-session sync flow instead of inventing a second cookie acquisition path.
- If background sync succeeds and produces a usable saved snapshot, probe should continue with the refreshed desktop-owned cookies.
- If background sync fails, probe behavior must remain predictable:
  - do not block forever
  - do not create a new user-facing prompt in V1
  - fall back to the currently saved desktop snapshot and continue the probe
  - write a diagnostic log entry so downgraded probe results remain debuggable

### Sync gating

- Do not sync on every advanced-quality probe.
- Use a code-owned staleness threshold in V1. Current preferred threshold: 24 hours since the last saved site-session snapshot.
- Skip pre-probe sync when the saved site-session snapshot is fresh.
- Skip pre-probe sync when the browser extension is not connected or the sync path is unavailable.
- Add a short explicit timeout for pre-probe sync. Current preferred timeout: 2-3 seconds.
- Deduplicate concurrent pre-probe syncs by site id so rapid repeated right-clicks do not trigger parallel cookie sync requests.
- Respect existing site-session authorization boundaries:
  - allow seeded sites
  - allow user-enabled sites
  - do not auto-sync arbitrary auto-discovered sites without user authorization

### Constraints

- Do not make every normal video download always refresh cookies.
- Do not turn browser-live cookies into the download source of truth; desktop-saved site session remains authoritative.
- Do not require popup interaction or a browser-side confirmation step during ordinary advanced-quality probing.
- Do not broaden this first pass to every login-sensitive site.

### Why this task exists

- Current runtime uses desktop-owned saved site-session cookies during probe/download.
- A browser tab may be currently logged in while the desktop snapshot is stale.
- That stale-but-not-fully-invalid state can silently reduce available qualities instead of producing a clean auth failure, so the existing auth-required auto-retry path does not catch it reliably.

## Claude Review Decisions

Claude reviewed this plan and the following points are accepted into the task scope:

- Pre-probe sync must run before advanced-quality probe context resolves desktop-owned cookies.
- The implementation should use a runtime option/hook rather than embedding site-session logic directly into the generic runtime layer.
- Pre-probe sync must have a short explicit timeout and must skip cleanly when no extension client is connected.
- Concurrent pre-probe sync must be deduped per site id.
- V1 should use a staleness threshold rather than syncing on every advanced-quality probe.
- Sync failure should fall back to the saved snapshot, not fail the advanced request in V1.
- Sync fallback should be logged for diagnostics.
- Pre-probe sync must respect site-session authorization boundaries.

## Acceptance Criteria

- [ ] Existing “同步” wording and current site-session UI entry points remain unchanged.
- [ ] No new user-visible toggle is added for this capability.
- [ ] Advanced-quality probe for Bilibili can refresh desktop-owned site-session cookies through the existing sync path before probing.
- [ ] Advanced-quality probe for YouTube can refresh desktop-owned site-session cookies through the existing sync path before probing.
- [ ] Fresh site-session snapshots do not trigger pre-probe sync.
- [ ] Stale site-session snapshots trigger at most one in-flight pre-probe sync per site id.
- [ ] If the refresh succeeds, the probe uses the refreshed desktop-owned cookies.
- [ ] If the refresh fails or times out, runtime behavior is deterministic, logs the fallback, and continues using the saved snapshot.
- [ ] If no browser extension client is connected, pre-probe sync is skipped without delaying the probe.
- [ ] Pre-probe sync is not attempted for unsupported or unauthorized auto-discovered site-session entries.
- [ ] Existing non-advanced download flows remain unchanged in V1.
- [ ] Existing auth-required retry logic remains available as a fallback path after this change.

## Non-Goals

- Replacing “同步” with new wording such as “记录”.
- Adding a site-level or global auto-refresh switch.
- Refreshing cookies before every ordinary download.
- Expanding this behavior to all supported sites in the first pass.
- Replacing desktop-owned cookie snapshots with browser-live cookies as the primary runtime contract.

## Open Questions

- Should a successful pre-probe sync update site-session UI state immediately even if the Settings window is not open?
- Confirm exact V1 threshold and timeout constants during implementation planning. Current preferred defaults are 24 hours and 2-3 seconds.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
