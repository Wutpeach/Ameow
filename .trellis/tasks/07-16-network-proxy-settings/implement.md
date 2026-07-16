# Implementation Plan

Do not start this checklist until the user approves the planning artifacts and
the task is moved to `in_progress`.

## Ordered Checklist

1. Finalize product decisions:
   Confirmed before implementation: first-release proxy support is manual
   HTTP(S) only, without credentials, and applies globally to covered
   Ameow-owned network layers. Settings uses automatic validation after manual
   proxy input settles rather than a required test button, and it does not test
   arbitrary content links. A valid manual URL is saved immediately, but it is
   the preferred proxy across restarts while manual mode is selected;
   unavailable manual proxy state falls back to system/ambient proxy behavior.
   Failure screens should not gain a Settings deep link in this task; broad
   error-code-to-readable-text work is deferred.
2. Read required specs before editing:
   - `.trellis/spec/backend/electron-runtime-contracts.md`
   - `.trellis/spec/backend/type-safety.md`
   - `.trellis/spec/backend/error-handling.md`
   - `.trellis/spec/backend/logging-guidelines.md`
   - `.trellis/spec/frontend/component-guidelines.md`
   - `.trellis/spec/frontend/design-system.md`
   - `.trellis/spec/frontend/state-management.md`
   - `.trellis/spec/frontend/docs-site.md`
3. Add shared proxy config parsing helpers plus preferred/effective proxy policy
   resolution.
   - Validate `http:` / `https:` only.
   - Reject credentials, path, query, hash, empty host, and unsupported schemes.
   - Keep stale historical proxy-like keys inert.
4. Extend `electron/desktopProxy.mts`.
   - Preserve current `{ mode: "system" }` behavior.
   - Add manual fixed-server support through `session.setProxy(...)`.
   - Include local bypass rules such as `<local>` and `127.0.0.1:39527` so the
     browser-extension WebSocket bridge is never proxied.
5. Add automatic manual-proxy validation state with debounce/cancellation,
   freshness, and support-log-safe status.
   - Validate after input settles and at startup when manual mode is selected.
   - Probe fixed infrastructure targets: GitHub, Deno, and PyPI.
   - Use short concurrent timeouts and sanitized per-target status.
   - Treat all-target failure or local-proxy connection failure as unavailable.
   - Revalidate after about 30 minutes or after proxy-shaped network failures.
6. Wire Electron session proxy application to prefer saved manual proxy across
   restarts while keeping safe fallback on invalid or unavailable manual values.
   Session changes should affect future requests; do not block startup on
   validation.
7. Pass only effective manual proxy settings into managed runtime bootstrap
   options.
8. Add pip child-process proxy environment support for managed Python package
   installs while manual proxy is effective.
9. Wire effective manual proxy into runtime `resolveNetworkProxy` or equivalent
   explicit context path for yt-dlp/probes without restoring implicit
   Electron-to-CLI translation.
10. Wire proxy-failure detection into bootstrap/download error paths.
    - Treat local proxy connection refusal, proxy connection timeout, and
      proxy/TLS handshake failures as proxy-shaped failures.
    - Mark the effective manual policy suspect, trigger revalidation, and fall
      back to system/ambient behavior if revalidation confirms unavailability.
    - Do not trigger proxy fallback for HTTP 403/404, private/unavailable
      content, region limits, auth failures, or extractor/site-rule failures.
11. Add gallery-dl proxy handling through child-process proxy environment
    variables while manual proxy is effective. Add a CLI-specific option only
    if implementation evidence shows environment variables are insufficient.
12. Update proxy diagnostics.
    - Include effective manual proxy policy when active.
    - Keep existing Electron/environment samples as diagnostics only.
    - Do not imply system `resolveProxy(...)` is the active CLI proxy path.
13. Add network diagnostics command(s) and support-log-safe result shapes for
    fixed infrastructure targets.
14. Add Settings UI for mode, proxy URL, validation, and automatic compact
    status after input settles.
    - Cover states: system active, editing, invalid, validating, manual active,
      manual fallback.
15. Update locale strings in root and browser-extension locale mirrors if
    needed.
16. Update public docs site troubleshooting and network/proxy guidance.
17. Add focused tests for config validation, effective-policy fallback,
    Electron proxy application, local bypass, bootstrap env, yt-dlp args,
    gallery-dl env, runtime defaults, validation status, and diagnostics
    sanitization.

## Validation Commands

- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm run docs:build`
- `git diff --check`

## Risky Files / Rollback Points

- `electron/main.mts`: composition root for session, runtime, bootstrap, and
  IPC wiring.
- `electron/managedRuntimeBootstrap.mts`: child-process bootstrap behavior.
- `electron/desktopProxy.mts`: Electron session proxy mode application.
- `src/electron-runtime/service.ts`: execution context and default proxy
  ownership.
- `src/electron-runtime/processRunner.ts`: shared CLI child-process environment
  propagation.
- `src/electron-runtime/galleryDlDownload.ts`: gallery-dl proxy environment.
- `src/electron-runtime/ytDlpCommandPlan.ts`: downloader CLI arguments.
- `src/config/cliProxy.ts`: diagnostics and parsing helpers.
- `src/pages/SettingsPage.tsx`: compact settings UI.
- `site/src/content/docs/`: user-facing docs.

Rollback should leave missing or invalid proxy config behaving like current
system/ambient behavior.

## Review Gates

- Confirm the implementation does not reintroduce implicit
  Electron `resolveProxy(...)` -> yt-dlp `--proxy` behavior.
- Confirm invalid proxy config cannot block app startup.
- Confirm manual fixed-server proxy uses local bypass rules and does not break
  the extension WebSocket bridge on `127.0.0.1:39527`.
- Confirm saved but unverified/unavailable manual proxy config cannot block
  bootstrap or downloads because effective policy falls back to system/ambient.
- Confirm saved manual proxy mode remains preferred across app restarts until
  the user switches back to system proxy or the proxy is unavailable.
- Confirm diagnostics and logs do not expose credentials, cookies, or raw
  sensitive URLs.
- Confirm docs tell users when TUN/global/VPN mode is still the better fix.
- Confirm Settings does not become a generic content-link tester.
- Confirm the task does not expand into the separate error-code translation UX
  work.

## Focused Test Matrix

- `electron/desktopProxy.test.mts`: system mode, manual fixed-server mode,
  local bypass rules, invalid manual fallback.
- Proxy config helper tests: valid HTTP(S), unsupported schemes, credentials,
  path/query/hash, empty host, unknown historical keys.
- Validation controller tests: debounce/cancellation, all-target failure,
  partial target failure, proxy connection refused/timeout, validation
  freshness expiry.
- Startup revalidation flow test: persisted manual mode is attempted on
  startup, background validation runs, and the policy remains manual or falls
  back based on validation result.
- Managed bootstrap tests: pip receives `HTTP_PROXY` / `HTTPS_PROXY` only when
  manual proxy is effective.
- Runtime service tests: default path has no proxy, effective manual path
  passes `proxyUrl` to yt-dlp/probes, failed validation falls back.
- Runtime proxy-failure tests: proxy-shaped download/bootstrap errors mark the
  policy suspect and trigger revalidation/fallback, while HTTP 403/404,
  auth/content/region/extractor failures do not.
- yt-dlp command-plan tests: existing explicit `--proxy` behavior remains.
- gallery-dl tests: child-process proxy environment is present only when
  manual proxy is effective.
- Diagnostics tests: sanitized manual scheme/host/port appears, credentials and
  raw sensitive URLs do not.
- Settings tests or focused component checks: compact states do not flicker
  during typing and invalid/unavailable states remain understandable.
