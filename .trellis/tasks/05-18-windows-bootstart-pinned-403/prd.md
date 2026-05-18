# Investigate Windows bootstart pinned lookup 403

## Goal

- Explain why Windows startup / bootstart can still surface `GitHub pinned lookup failed: 403` even after the app gained a global desktop proxy setting.
- Produce a concrete, evidence-backed fix plan before any implementation starts.

## Confirmed Facts

- The failing error string is thrown in `electron/managedRuntimeBootstrap.mts` when the pinned GitHub release metadata request returns a non-OK HTTP status.
- The failing pinned lookup requests target GitHub release tag APIs such as:
  - `https://api.github.com/repos/yt-dlp/yt-dlp/releases/tags/2026.03.17`
  - `https://api.github.com/repos/gdl-org/builds/releases/tags/2026.04.01`
- Managed runtime bootstrap uses `options.fetch(...)`, and Electron wires that to `fetchWithDesktopSession(...)` in `electron/main.mts`.
- `fetchWithDesktopSession(...)` prefers `session.defaultSession.fetch(...)`, so desktop-owned fetches should inherit Electron session proxy settings when those settings are applied.
- Global desktop proxy support was added in commit `7d7cbec` and is applied through `session.defaultSession.setProxy(...)` via `applyConfiguredDesktopProxy(...)`.
- `applyConfiguredDesktopProxy(...)` runs after `await app.whenReady()` during desktop startup and also runs when config is saved from Settings.
- Frontend startup auto-bootstrap triggers from `src/App.tsx` after the initial window-visible/deferred-startup sequence by calling `startRuntimeDependencyBootstrap("startup_auto_retry")`.
- Windows autostart code in `electron/autostart.mts` only manages login-item registration/query state; no GitHub request originates there directly.

## Requirements

- Determine whether the remaining 403 is caused by proxy configuration timing, missing persisted proxy config at boot, session/proxy behavior differences in Windows autostart context, or GitHub-side rejection unrelated to proxy routing.
- Cross-check the local hypothesis with an external second opinion from Claude Code.
- Keep the task in planning until the likely root cause and proposed fix shape are explicit.
- Favor a fix that reduces false startup failures without weakening the managed-runtime download path for the large binary assets.
- Replace the pinned GitHub release metadata lookup with fixed release download URLs for yt-dlp and gallery-dl, since their versions are already pinned at build time.

## Acceptance Criteria

- [ ] Task artifacts record the confirmed local call chain from startup bootstrap trigger to pinned GitHub release lookup.
- [ ] Claude consultation results are captured in task research notes.
- [ ] A short list of likely root causes is ranked by evidence strength.
- [ ] A proposed fix plan is documented with validation ideas, even if code changes have not started yet.

## Likely Out Of Scope

- Shipping the actual code fix in this planning step.
- Broad refactors of runtime bootstrap unrelated to the Windows bootstart 403.

## Open Questions

- Does the affected machine already have a persisted `globalProxyEnabled/globalProxyUrl` config before the autostart launch, or is the proxy only active in the user's shell/session environment?
- If a persisted global proxy exists, is the 403 coming from GitHub after the request successfully traverses the proxy, or from a direct non-proxied request path that still bypasses Electron session proxying?
- If GitHub is rate-limiting or proxy-blocking the pinned metadata fetch, should the app prefer a fallback metadata lookup path, or only surface a better error?

## Consultation Notes

- Claude assessed the proxy timing hypothesis as weak because startup applies the proxy before the renderer-triggered bootstrap begins.
- Claude considered GitHub-side rejection of the unauthenticated release API call the stronger hypothesis.
- Claude recommended adding response diagnostics and a safer fallback path for the metadata lookup rather than only adding more proxy wiring.
- The accepted product decision is to remove the metadata query entirely and use fixed asset URLs for the pinned downloader releases.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
