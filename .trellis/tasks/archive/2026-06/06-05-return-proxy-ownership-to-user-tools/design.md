# Technical Design

## Architecture

Ameow will stop treating proxy routing as an application-owned behavior. The
desktop runtime will keep using the platform and Electron defaults for
Electron-owned requests, while CLI downloaders run without an implicit proxy
derived from Electron `resolveProxy(...)`.

The implementation separates three concerns:

1. Network execution:
   - Electron-owned fetches continue to use `fetchWithDesktopSession(...)`.
   - Electron desktop sessions stay in system/default proxy behavior.
   - yt-dlp/ffmpeg commands do not receive an automatically inferred
     `--proxy` by default.
2. Diagnostics:
   - Proxy resolution may still be sampled and logged as evidence.
   - Diagnostics describe why Ameow did not translate a detected proxy into
     CLI behavior.
   - Support logs include recent runtime log lines, so proxy diagnostics should
     be emitted through the existing runtime log path first.
3. User guidance:
   - User-facing failures compatible with proxy/network issues should recommend
     proxy-tool modes that capture all process traffic, such as TUN/global/VPN.
   - Ameow should not prompt users to configure an Ameow-owned proxy.

## Boundaries

- `electron/main.mts` remains the composition root for Electron session setup,
  runtime creation, and runtime logging.
- `src/electron-runtime/service.ts` owns runtime execution context creation and
  must stop passing an implicit CLI proxy into yt-dlp contexts by default.
- `src/electron-runtime/ytDlpCommandPlan.ts` should continue to add `--proxy`
  only when `context.proxyUrl` is explicitly provided by the runtime context.
  The default runtime path should not provide that value from Electron
  `resolveProxy(...)`.
- `ElectronDownloadRuntimeOptions.resolveNetworkProxy` should remain available
  as an explicit test/advanced injection hook for now. The default Electron
  composition root should stop wiring it to `session.resolveProxy(...)`.
- `src/config/cliProxy.ts` should be repurposed into proxy diagnostics helpers
  rather than duplicated. It may still expose parser-level helpers, but those
  helpers must no longer drive default CLI behavior.
- `electron/supportLogExport.mts` already includes recent runtime logs. Avoid a
  separate support-log data path unless runtime logs are insufficient.

## Data Flow

### Before

1. Runtime selects yt-dlp.
2. Runtime asks Electron main to resolve a proxy for one target URL.
3. Electron main calls `session.resolveProxy(targetUrl)`.
4. HTTP/HTTPS-like results are converted into a single CLI URL.
5. Runtime puts that URL in `EngineExecutionContext.proxyUrl`.
6. yt-dlp command args include `--proxy <url>`.

### After

1. Runtime selects yt-dlp.
2. Runtime optionally records proxy diagnostics for the selected target URL.
3. Runtime leaves `EngineExecutionContext.proxyUrl` null in the default path.
4. yt-dlp and ffmpeg run under the user's ambient network environment.
5. Network failures remain handled runtime/update/bootstrap errors and include
   TUN/global/VPN guidance when appropriate.

## Proxy Diagnostics Contract

Diagnostics should classify a sampled proxy state into a small, stable set:

- `direct`: no proxy was resolved or usable for the sampled URL.
- `http`: an HTTP/HTTPS proxy was resolved, but Ameow did not inject it into
  CLI commands by default.
- `socks_unsupported`: a SOCKS proxy was detected and left to the user's proxy
  tool, because Ameow does not translate it into yt-dlp/ffmpeg CLI behavior.
- `mixed_or_pac`: multiple or rule-derived proxy entries were detected and are
  not safe to collapse into one CLI proxy.
- `environment`: an HTTP(S)/ALL proxy environment variable was detected.
- `resolution_failed`: proxy sampling failed.
- `skipped_non_ytdlp`: proxy diagnostics were intentionally skipped because the
  selected engine is not yt-dlp.

Each diagnostic entry must include the sampled target URL or a sanitized host
summary so support logs do not imply that one YouTube page proxy result covers
every host contacted by yt-dlp/ffmpeg.

The diagnostic payload should not include credentials. It may include sanitized
scheme/host/port. Do not include raw proxy rules in user-facing output if they
contain credentials or unparsed user input.

## Error Handling

Primary fix paths should catch errors at concrete request boundaries introduced
or changed by this task:

- proxy diagnostic sampling.
- proxy-aware YouTube/GitHub failure summarization.

General unhandled promise/exception auditing across app update, runtime
bootstrap, and managed downloads is valuable but is broader than this task. It
should be scheduled as a follow-up unless implementation evidence shows the
observed Electron dialog is still reachable after removing the proxy bridge and
catching diagnostic failures.

Global `unhandledRejection` / `uncaughtException` handling is out of scope for
the first implementation unless a concrete, task-owned path still reaches the
Electron default dialog. It must not replace local error handling or swallow
unrelated application bugs silently.

## Compatibility

- Stale config keys `globalProxyEnabled` and `globalProxyUrl` remain inert.
- Existing browser-extension payloads do not need proxy fields.
- Bilibili and other non-YouTube flows should continue to run under ambient
  network behavior.
- Dev and packaged builds may differ in environment variables and process path
  based proxy rules; tests should avoid assuming one environment.

## Trade-Offs

Removing automatic CLI proxy injection may make HTTP system-proxy users rely on
their proxy tool's TUN/global mode rather than a partial Ameow bridge. This is
intentional: a single resolved proxy for one URL is not reliable for yt-dlp and
ffmpeg, which contact multiple hosts during one download.

Keeping diagnostics without automatic behavior gives users and support logs
visibility without creating a false sense that Ameow can safely translate every
proxy mode.

## Rollback

If removing default CLI proxy injection causes unacceptable regressions for
known HTTP/HTTPS proxy users, a later task may add an explicit advanced opt-in.
That opt-in should remain off by default, log the exact proxy source, and warn
that TUN/global/VPN mode is preferred for YouTube.

## Spec Reversal

This task intentionally reverses the current backend spec contract that says
yt-dlp CLI downloads should receive a resolved proxy through `--proxy` when
available. The new contract is:

- Electron fetches continue to use desktop/session defaults.
- yt-dlp/ffmpeg default to ambient process/network behavior.
- Electron proxy resolution is diagnostic evidence, not an implicit CLI proxy
  bridge.
- Any future CLI proxy bridge must be explicit and off by default.
