# Plan explicit network proxy settings

## Goal

Plan an explicit network/proxy capability for Ameow so users who hit bootstrap
or download failures caused by proxy routing can configure and diagnose the
network path without relying on hidden behavior or support guesswork.

The first planned outcome is a reviewed product and technical plan. No
implementation should start until the planning artifacts are approved.

## User Value

- Users can understand whether a failure is caused by app bootstrap,
  Python package installation, yt-dlp/gallery-dl, ffmpeg/media retrieval, or
  the target site itself.
- Users behind local proxy tools can provide an explicit HTTP(S) proxy when
  system proxy/TUN/global/VPN mode is not enough or not available.
- Users do not need to learn a separate proxy-testing workflow; Ameow should
  validate the setting automatically when the user finishes entering it.
- Support logs can explain the active network mode and sampled proxy state
  without exposing credentials, cookies, or raw sensitive URLs.

## Confirmed Facts

- Electron currently applies system proxy mode to the default session at
  startup through `applySystemProxyToSession(...)`.
- Electron-owned fetches use `fetchWithDesktopSession(...)`, so managed binary
  downloads such as deno/ffmpeg can inherit Electron session/system proxy
  behavior.
- Managed Python package bootstrap for `yt-dlp` and `gallery-dl` runs
  `python -m pip install ...` as a child process and currently inherits only
  the ambient process environment.
- yt-dlp command planning already supports an explicit `proxyUrl` by adding
  `--proxy <url>`, but the default runtime path does not populate it.
- Existing task history intentionally removed automatic translation from
  Electron `resolveProxy(...)` into yt-dlp CLI proxy arguments because PAC,
  SOCKS, mixed rules, and multi-host downloader flows are not safely collapsible
  into one implicit CLI proxy.
- `src/config/cliProxy.ts` already contains proxy diagnostic helpers for
  classifying Electron/environment proxy state.
- Settings already uses config patches through `saveConfigPatch(...)`, and the
  settings UI has a System page where network/proxy controls could fit.
- User-facing behavior changes should update the public docs site under
  `site/src/content/docs/`.

## Requirements

- Add a user-visible network/proxy plan for bootstrap and downloader failures.
- Preserve the default recommendation that users should prefer their proxy
  tool's TUN/global/VPN/system-proxy mode when it reliably captures Ameow and
  its child processes.
- Any Ameow-owned proxy bridge must be explicit, off by default, and scoped so
  users can understand what it affects.
- The first supported manual proxy mode is conservative: HTTP(S) proxy URL
  without credentials.
- When enabled, the manual HTTP(S) proxy should apply globally to all
  Ameow-owned network layers covered by the first release, instead of exposing
  separate "bootstrap only" or "downloads only" scopes.
- The planned feature must cover both bootstrap-time network paths and
  download-time network paths, not only the renderer or only yt-dlp.
- The planned feature must include diagnostics that identify which layer failed
  or succeeded.
- The first-release diagnostics should avoid asking users to test arbitrary
  site links. Site-specific download failures should stay in the download
  troubleshooting flow because they can be caused by login state, region,
  access rights, anti-bot checks, or site extractor changes rather than the
  proxy setting itself.
- The settings experience should minimize interaction and understanding cost:
  no mandatory "test" button for normal use.
- The planned feature must avoid logging credentials, cookies, full sensitive
  URLs, or raw unparsed proxy rules.
- The planned feature must include user-facing docs and troubleshooting updates
  if implemented.
- Failure UI should not add a direct Settings deep-link in this task. At most,
  the proxy feature may add lightweight network/proxy wording where already
  appropriate, while broader download error-code translation is deferred to a
  later task.

## Proposed MVP Direction

- Settings > System gets a compact Network / Proxy section.
- Default mode remains "Use system proxy".
- Advanced mode allows a manual HTTP(S) proxy such as
  `http://127.0.0.1:7890`.
- After the user finishes editing a manual proxy URL, Ameow automatically
  validates the value and probes fixed infrastructure targets needed for app
  operation. The UI shows a compact status instead of requiring a separate test
  action.
- The explicit proxy is applied to:
  - Electron session fetches.
  - managed runtime asset downloads.
  - pip child-process environment during managed Python package bootstrap.
  - yt-dlp download/probe command args through the existing `proxyUrl` path.
  - gallery-dl where supported through environment or downloader-specific
    options determined during design.
- Automatic diagnostics should focus on fixed infrastructure targets such as
  GitHub, Deno runtime downloads, and PyPI/pip package access. They should not
  require or encourage users to paste a failing content URL into Settings.

## Acceptance Criteria

- [ ] `prd.md` documents goal, user value, confirmed facts, requirements,
      acceptance criteria, out-of-scope items, and open questions.
- [ ] `design.md` documents the cross-layer architecture, config shape,
      validation rules, data flow, diagnostics contract, compatibility, and
      rollback strategy.
- [ ] `implement.md` documents an ordered implementation checklist, validation
      commands, risky files, and docs/test requirements.
- [ ] Planning explicitly decides the first-release proxy scope and unsupported
      cases.
- [ ] Planning preserves the prior decision that implicit Electron-to-CLI proxy
      translation must not return as default behavior.
- [ ] Planning identifies bootstrap and download network paths that must be
      covered or intentionally deferred.
- [ ] Planning distinguishes saved manual proxy preference from the effective
      runtime proxy policy, and requires system/ambient fallback when manual
      proxy validation fails or is unavailable.
- [ ] Planning requires local loopback traffic, including the browser-extension
      WebSocket bridge, to bypass manual proxy routing.
- [ ] Planning defines automatic validation state and fallback criteria well
      enough to implement without adding a manual test workflow.

## Out Of Scope For First Plan Unless Reopened

- Automatically translating PAC or rule-based proxy output into CLI proxy
  arguments.
- Transparent SOCKS support as the first shipped manual setting.
- Proxy username/password storage.
- Per-site proxy rules.
- Silent background mutation of system proxy settings.
- Bypassing target-site access controls, login requirements, regional limits,
  or anti-bot checks.

## Decisions

- First-release proxy support is manual HTTP(S) only, without SOCKS, PAC,
  per-site rules, or proxy credentials.
- Manual proxy mode applies globally to covered Ameow-owned network layers.
- Settings should prefer automatic validation after proxy input over a manual
  test button.
- First-release proxy settings should not include arbitrary content-link
  testing.
- Fixed validation targets should be derived from Ameow-owned infrastructure
  dependencies rather than user choice. Current candidates are GitHub release
  access, Deno runtime download access, and PyPI/pip package access.
- Manual proxy routing must not proxy local loopback traffic; the browser
  extension WebSocket bridge on `127.0.0.1:39527` must keep working.
- Automatic validation should not disable manual proxy for one isolated target
  failure if other infrastructure targets work. Manual proxy should fall back
  to system/ambient behavior when all fixed probes fail or failures clearly
  show the local proxy is unreachable.
- A syntactically valid manual proxy URL is saved immediately and is the
  preferred proxy while manual mode is selected.
- If the saved manual proxy cannot be verified or is detected as unavailable,
  Ameow automatically uses system/ambient proxy behavior instead of continuing
  through the unverified manual proxy.
- Across restarts, a saved manual proxy remains the preferred proxy setting.
  Ameow should try to apply it first, then fall back to system/ambient proxy
  behavior only when validation or use indicates it is unavailable.
- The user-facing model should stay simple: "system proxy" or "manual proxy".
  Internal validation/fallback details should not force users to understand
  multiple transient proxy states.
- This task does not add a failure-screen deep link into proxy settings.
- Broad conversion of downloader/internal error codes into user-readable
  explanations is intentionally deferred to a future task.

## Open Questions

- None currently blocking planning.

## Notes

- This is a complex cross-layer task and should have `design.md` and
  `implement.md` before `task.py start`.
