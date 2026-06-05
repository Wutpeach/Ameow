# Return proxy ownership to user proxy tools

## Goal

Return network proxy ownership to the user's proxy software instead of letting
Ameow silently configure or bridge proxy behavior across Electron, yt-dlp,
ffmpeg, managed runtime bootstrap, and update flows.

The user value is fewer environment-specific proxy failures, no Electron main
process JavaScript error dialogs for ordinary network failures, and clearer
guidance when YouTube/GitHub access requires a proxy mode that captures all
process traffic.

## Background

Users on the latest portable build reported an Electron main-process dialog
after checking updates, downloading, or updating yt-dlp while a proxy was
enabled:

- `A JavaScript error occurred in the main process`
- `Uncaught Exception: Error: net::ERR_CONNECTION_CLOSED`
- stack only included Electron/Chromium network internals such as
  `SimpleURLLoaderWrapper` / `node:electron/js2c/browser_init`.

One affected user reported that enabling the proxy tool's global mode stopped
the main-process error dialog. YouTube downloads still failed with a
format-related message, while Bilibili downloads worked.

The development machine has not reproduced the issue under `npm run dev`.

## Confirmed Facts

- FlowSelect-era builds already had managed runtime, updater, and remote
  component behavior, so feature presence alone is not the likely regression.
- Recent Ameow changes altered proxy handling:
  - `4a2cb1f` routed main-process fetches through Electron
    `session.defaultSession.fetch`.
  - `58145e3` injected that session-backed fetch into runtime execution.
  - `7d7cbec` temporarily added an Ameow-owned fixed proxy setting.
  - `a836f93` moved desktop proxy handling toward system proxy sessions.
- Current code keeps Electron-owned fetches on Chromium/session networking.
- Current runtime proxy resolution can infer a CLI proxy from
  `session.resolveProxy(targetUrl)` or HTTP(S)/ALL proxy environment variables
  and pass it to yt-dlp as `--proxy`.
- Current `cliProxy` conversion supports HTTP/HTTPS proxy rules but
  intentionally does not convert SOCKS rules for CLI use.
- A single `session.resolveProxy(targetUrl)` result is not guaranteed to be a
  correct proxy for all hosts yt-dlp/ffmpeg may contact during one YouTube
  download, such as `youtube.com`, `googlevideo.com`, `ytimg.com`, and remote
  component endpoints.
- Claude consultation agreed that app-level proxy bridging is fragile and that
  TUN/global/VPN capture is the most coherent way to cover Electron,
  yt-dlp, ffmpeg, Python, Deno, and update/bootstrap traffic uniformly.

## Requirements

- Ameow must not expose, consume, or reintroduce an Ameow-owned manual global
  proxy configuration as the normal product path.
- Ameow should treat the user's proxy tool as the owner of proxy routing.
- Product guidance for proxy-required sites should recommend proxy-tool modes
  that capture all process traffic, such as TUN/global/VPN mode.
- Electron-owned fetches may continue to use the default/session/system network
  behavior, but ordinary network failures must be surfaced as app UI/state
  errors rather than Electron main-process JavaScript error dialogs.
- yt-dlp/ffmpeg downloads must no longer silently depend on a fragile
  `session.resolveProxy(...)` to `--proxy` bridge as the default behavior.
- If any automatic CLI proxy bridge remains, it must be explicit,
  conservative, diagnosable, and disabled or non-authoritative by default.
- Automatic CLI `--proxy` injection derived from Electron `resolveProxy(...)`
  should be removed from the default download path. The initial implementation
  should keep proxy resolution only as diagnostic evidence, not as an implicit
  behavior change.
- Proxy diagnostics must distinguish at least:
  - direct/no proxy detected;
  - HTTP/HTTPS proxy detected;
  - SOCKS or PAC-like proxy behavior that Ameow will not translate for CLI
    downloads;
  - environment proxy detected;
  - proxy resolution failure.
- YouTube-facing download/update/runtime errors should include actionable
  proxy guidance when the observed failure is compatible with network/proxy
  misconfiguration.
- Existing stale config keys such as `globalProxyEnabled` / `globalProxyUrl`
  must not mutate Electron or CLI proxy behavior.
- The solution must preserve normal Bilibili and other direct-download behavior.

## Acceptance Criteria

- [ ] No Settings or first-run surface offers Ameow-owned manual proxy setup as
      the primary fix for network issues.
- [ ] Saving config with stale proxy keys does not call Electron `setProxy`
      with `fixed_servers` or otherwise apply an app-owned proxy.
- [ ] By default, yt-dlp command construction does not silently inject a proxy
      derived from a single Electron `resolveProxy(targetUrl)` result.
- [ ] If a diagnostic or opt-in CLI proxy path remains, tests cover HTTP,
      HTTPS, SOCKS, DIRECT, mixed, malformed, and environment-proxy cases.
- [ ] Runtime bootstrap, app update checks, yt-dlp update/download flows, and
      YouTube download failures surface handled UI/state errors instead of
      causing an Electron main-process JavaScript error dialog.
- [ ] User-facing copy or diagnostics clearly recommend TUN/global/VPN mode
      when Ameow cannot safely translate the detected proxy setup to child
      process downloads.
- [ ] Task-relevant unit tests pass for proxy resolution, Electron desktop
      proxy handling, runtime service proxy behavior, and yt-dlp command args.
- [ ] `npm run type-check` and `npm run lint` pass before implementation is
      considered complete.

## Out Of Scope

- Building a full proxy manager inside Ameow.
- Supporting authenticated proxies as an app-level configuration.
- Guaranteeing PAC or rule-based proxy equivalence for every host used by
  yt-dlp, ffmpeg, YouTube, GitHub, and managed runtime sources.
- Implementing custom packet capture, VPN, or TUN behavior in Ameow.

## Decisions

- Automatic CLI `--proxy` injection derived from Electron `resolveProxy(...)`
  will be removed from the default path. The first implementation will not add
  a hidden or advanced opt-in.
- Proxy diagnostics should first land in runtime/download status and support
  logs. A dedicated Settings network diagnostics panel is deferred until there
  is evidence that the lighter diagnostics are insufficient.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
