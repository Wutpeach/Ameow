# Implement — In-app local proxy server

Execution order. Each step lands with its own tests before the next begins.

## 1. Config and types (`src/config/localProxyServer.ts` + `.test.ts`)

- `DEFAULT_LOCAL_PROXY_PORT = 21080`, `LOCAL_PROXY_HOST = "127.0.0.1"`.
- `normalizeLocalProxyServerConfig(raw: Record<string, unknown>): LocalProxyServerConfig`
  reading `localProxyEnabled` / `localProxyPort`, falling back per field.
- `buildLocalProxyTargetUrl(host, port)` with IPv6 bracketing.
- `LocalProxyServerState` payload type.
- Tests: defaults, partial config, out-of-range port, non-numeric port, IPv6
  and port-80 URL shaping.

## 2. Egress dialing (`electron/localProxyUpstream.mts` + `.test.mts`)

- `dialThroughRoute({ route, host, port, timeoutMs })` → connected socket.
- Direct, HTTP/HTTPS upstream `CONNECT`, SOCKS4/4a, SOCKS5 (+ RFC 1929).
- `complex` / resolution failure → typed refusal, no silent downgrade.
- Tests against loopback stubs (fake HTTP proxy, fake SOCKS5 server).

## 3. Protocol handlers (`electron/localProxyProtocol.mts` + `.test.mts`)

- HTTP: request-line parse, `CONNECT` tunnel, absolute-form forward.
- SOCKS5: greeting, `CONNECT`, unsupported command/ATYP replies.
- Both take an injected `dial` so tests need no real egress.
- Tests: tunnel echo, refusal mapping, malformed request.

## 4. Server lifecycle (`electron/localProxyServer.mts` + `.test.mts`)

- `createLocalProxyServer({ resolveRoute, log, emitStateChanged, now })`.
- `start({ port })`, `stop()`, `reconfigureFromConfig()`, `getState()`.
- First-byte sniffing; counters; `EADDRINUSE` → `running: false` + `lastError`.
- Tests: both protocols on one port, conflict, counters, state transitions.

## 5. Desktop wiring (`electron/main.mts`, preload, renderer types)

- Lazy `getLocalProxyServer()` using `getDesktopNetworkRouteService()`.
- `save_config` → `reconfigureFromConfig()`.
- `get_local_proxy_state` command; `local-proxy-state-changed` event.
- Startup apply after ready; stop on quit.
- `src/types/electronBridge.ts`: add command + event names.

## 6. Settings UI + locales

- New `NeonSection` in `src/pages/SettingsPage.tsx`: toggle, port input with
  validation, status line, copyable `127.0.0.1:<port>` address.
- `src/locales/zh-CN/desktop.json` + `src/locales/en/desktop.json`.

## 7. Docs

- `site/src/content/docs/docs/desktop/settings.md` + `/en/` counterpart.
- `site/src/content/docs/docs/troubleshooting/download-failures.md` guidance
  update.

## 8. Verification

- `npm run type-check`, `npm run lint`, `npm test`, `npm run docs:build`,
  `git diff --check`.

## Open decisions (resolved)

- Mixed single port — decided.
- No OS proxy mutation — decided.
- Default port `21080` — decided.

## Implementation deltas (what actually shipped)

- The egress dialer is exported as `dialLocalProxyEgress({ route, host, port, timeoutMs })`
  from `electron/localProxyUpstream.mts`, not `dialThroughRoute`.
- The server takes an injected dial function — `createLocalProxyServer({ dial, log,
  onStateChanged, now })` — and exposes `start(config) / stop() / getState()`. Rebuilding the
  listener from `settings.json` lives in `electron/main.mts` as `applyLocalProxyServerConfig()`,
  called once after `app.whenReady()` and after every `save_config`.
- App locale files live at the repository root (`locales/zh-CN/desktop.json`,
  `locales/en/desktop.json`), not under `src/`.
- No OS proxy mutation ships: the UI shows the `http://127.0.0.1:<port>` and
  `socks5://127.0.0.1:<port>` endpoints for the user to copy.
- Self-route guard: `isLocalProxySelfRoute(route, listener)` in
  `src/config/localProxyServer.ts` detects an upstream route that points back at
  the listener, and `electron/main.mts` refuses it with a typed `refused` egress
  instead of dialing itself forever.
- The absolute-form HTTP path is covered end to end in
  `electron/localProxyServer.test.mts`; its `afterEach` force-closes upstream
  keep-alive sockets (`closeAllConnections`) because those sockets belong to the
  dialer, not the test.
