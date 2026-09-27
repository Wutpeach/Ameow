# Design — In-app local proxy server

## Module layout

| Module | Responsibility |
| --- | --- |
| `src/config/localProxyServer.ts` | Config normalization (`LocalProxyServerConfig`), defaults, port validation, canonical target-URL builder, `LocalProxyServerState` payload type. Framework-light, no Electron import. |
| `electron/localProxyUpstream.mts` | Egress dialing: map a resolved `NetworkRoute` to a connected TCP/TLS stream — direct, HTTP/HTTPS upstream via `CONNECT`, SOCKS4/4a, SOCKS5 (RFC 1929 user/pass). |
| `electron/localProxyProtocol.mts` | Protocol handlers over a client socket plus a `dial` callback: HTTP request/CONNECT handling, SOCKS greeting/request handling. |
| `electron/localProxyServer.mts` | Mixed-port listener, first-byte sniffing, lifecycle (`start` / `stop` / `reconfigureFromConfig`), state aggregation, `emitStateChanged`. |
| `electron/main.mts` | Wiring: lazy controller, `save_config` re-apply, `get_local_proxy_state` command, `local-proxy-state-changed` event, shutdown. |

Every new `electron/*.mts` gets a sibling `*.test.mts`, matching the existing
dependency-injection style (`createX({ ...deps })`, no Electron globals inside
the module).

## Config (`settings.json`)

Flat keys, matching the existing `networkProxyMode` / `networkProxyUrl` style:

- `localProxyEnabled: boolean` — default `false`
- `localProxyPort: number` — default `21080`, valid range `1024-65535`

Anything else falls back to the default via `normalizeLocalProxyServerConfig`.
Default port `21080` is the user's explicit choice; it stays clear of the
`7890` / `7891` / `1080` defaults commonly occupied by Clash / v2ray / SSH
tunnels and of the extension WS bridge (`39527`).

Ameow never writes the OS proxy settings: the settings card shows the
`127.0.0.1:<port>` address for the user to paste into the browser or system
proxy configuration.

## Canonical target URL

`resolveRoute` needs a URL, not an authority. `buildLocalProxyTargetUrl(host, port)`:

- port `80` → `http://host/`
- otherwise → `https://host:port/`
- IPv6 literals are bracketed (`https://[::1]:8443/`).

Rationale: `CONNECT` / SOCKS carry no scheme, while the environment tier keys
off scheme (`HTTPS_PROXY` vs `HTTP_PROXY`). Treating every non-80 port as HTTPS
matches what browsers actually tunnel.

## Egress decision table

| Resolved route | Egress behavior |
| --- | --- |
| `mode: "direct"` | `net.connect(target)` |
| `mode: "proxy"`, `protocol: "http"` | TCP to upstream, `CONNECT target` for tunnels |
| `mode: "proxy"`, `protocol: "https"` | TLS to upstream, `CONNECT target` for tunnels |
| `mode: "proxy"`, `protocol: "socks5"` | SOCKS5 client negotiation, then `CONNECT target` |
| `mode: "proxy"`, `protocol: "socks4"` | SOCKS4 / 4a client, then `CONNECT target` |
| `mode: "complex"` | refuse — HTTP `502` + reason, SOCKS `0x02` |
| resolution throws | refuse — HTTP `502`, SOCKS `0x01` |

Plain (non-`CONNECT`) HTTP requests are forwarded with `http.request`:
absolute-form preserved when egress is an HTTP proxy, rewritten to origin-form
(+ `Host`) for direct egress.

## State payload

```ts
type LocalProxyServerState = {
  enabled: boolean;              // configured intent
  running: boolean;              // actual listener state
  port: number;
  address: "127.0.0.1";
  activeConnections: number;
  totalConnections: number;
  totalFailures: number;
  lastError: string | null;      // redacted
  startedAtMs: number | null;
  updatedAtMs: number;
};
```

Emitted on every lifecycle transition and on connect/disconnect counter change
(debounced through `emitStateChanged`).

## Error matrix

| Condition | Client-visible result | State |
| --- | --- | --- |
| Egress refused (`complex`) | HTTP `502`, SOCKS `0x02` | `totalFailures++` |
| DNS / connect failure | HTTP `502`, SOCKS `0x05` | `totalFailures++` |
| Unsupported SOCKS command | SOCKS `0x07` | `totalFailures++` |
| Unsupported SOCKS ATYP / auth | SOCKS `0x08` / `0xFF` | `totalFailures++` |
| Malformed HTTP request | HTTP `400` | `totalFailures++` |
| Port in use at bind | — | `running: false`, `lastError` |

## Testing

- `src/config/localProxyServer.test.ts` — normalization, defaults, port bounds.
- `electron/localProxyUpstream.test.mts` — decision table against a stub
  upstream (fake HTTP proxy, fake SOCKS5 server) plus the direct case.
- `electron/localProxyProtocol.test.mts` — HTTP `CONNECT`, absolute-form HTTP,
  SOCKS5 greeting/CONNECT, unsupported command, complex refusal.
- `electron/localProxyServer.test.mts` — start/stop, sniffing both protocols on
  one port, port conflict, counters, state emission.

All tests drive real loopback sockets; no live internet access.

## Docs

- `site/src/content/docs/docs/desktop/settings.md` — new "本地代理服务器" section.
- `site/src/content/docs/en/docs/desktop/settings.md` — English counterpart.
- `site/src/content/docs/docs/troubleshooting/download-failures.md` — the
  "let your own proxy tool take over" guidance now also names Ameow's built-in
  local proxy as an option.
