# In-app local proxy server (HTTP CONNECT + SOCKS5)

## Goal

Add an opt-in loopback proxy listener inside Ameow desktop so local browsers,
system proxy settings and the browser extension can route outbound traffic
through Ameow's existing single-precedence network route
(manual > system > environment > direct).

## Requirements

### R1 — Opt-in, loopback only

- Disabled by default; enabled from Settings.
- The listener binds `127.0.0.1` only. No `0.0.0.0`, no LAN exposure.
- No client authentication: the loopback interface is the trust boundary.

### R2 — One mixed port, two protocols

- A single `<port>` serves both an HTTP proxy and a SOCKS5 proxy.
- First-byte sniffing selects the protocol: `0x05` → SOCKS5, `0x04` → SOCKS4/4a,
  otherwise an ASCII HTTP method → HTTP.
- HTTP surface: `CONNECT host:port` tunnels and plain absolute-form HTTP
  requests (`GET http://host/path HTTP/1.1`).
- SOCKS5 surface: no-auth greeting negotiation, `CONNECT` (cmd `0x01`),
  `ATYP` IPv4 / domain / IPv6.

### R3 — Egress reuses the single route service

- Every target authority is routed through
  `NetworkRouteService.resolveRoute({ targetUrl, consumer: "local-proxy" })`.
- Precedence stays manual > URL-specific system (proxy or explicit DIRECT)
  > target-resolved environment > direct.
- The server must never read system proxy state or ambient proxy variables
  itself.

### R4 — Fresh per-request resolution

- Browser traffic is not a queued download job: every new connection resolves
  its own route for its own target authority. No cached or sticky route.

### R5 — Explicit refusal, never a silent downgrade

- `complex` routes are refused: HTTP `502` with a typed reason; SOCKS5 reply
  `0x02` (connection not allowed).
- Unsupported SOCKS commands (`BIND`, `UDP ASSOCIATE`) are refused with `0x07`.

### R6 — Settings surface

- Toggle, port field with validation, and live status: running/stopped,
  effective port, active connections, last error.

### R7 — Persistence and live apply

- Stored in `settings.json`; applied on save without an app restart.

### R8 — Start/stop robustness

- Enabled → starts after app ready.
- Port already in use / bind failure → the app keeps running, state reports
  `running: false` + `lastError`, and the UI surfaces it.

### R9 — Secret hygiene

- Upstream proxy credentials never reach logs or state payloads; reuse
  `redactNetworkCredentials`.

## Non-Goals

- No LAN/remote exposure, no PAC serving, no client authentication, no SOCKS
  `BIND` / `UDP ASSOCIATE`, no TLS interception (MITM), no per-site rules,
  no traffic shaping or logging of visited URLs.
- No automatic system-proxy mutation: Ameow exposes the port and shows the
  address; pointing the OS or browser proxy at it stays the user's own action
  (user decision).

## Acceptance Criteria

Covered by the socket-level suites (`src/config/localProxyServer.test.ts` 11,
`electron/localProxyUpstream.test.mts` 9, `electron/localProxyServer.test.mts`
10 — 30 cases):

- [x] With the feature disabled, no port is opened: the listener only starts
      from `applyLocalProxyServerConfig()` while `localProxyEnabled` is true.
- [x] HTTPS-shaped traffic loads through a CONNECT tunnel and an absolute-form
      `http://` request is forwarded — both against a real loopback origin.
- [x] The same port accepts SOCKS5 clients and tunnels to a loopback target.
- [x] Egress failures reach clients as HTTP `502` / SOCKS5 reply `0x04`.
- [x] A `complex` (refused) route is rejected with a typed error, never
      downgraded to direct.
- [x] A port conflict surfaces `lastError` and leaves the app usable.
- [x] A route pointing back at the listener is refused instead of looping.
- [x] `npm run type-check`, `npm run lint`, `npm run docs:build` pass.

Still open, and only closable with a running app:

- [ ] A manual upstream proxy actually receives egress traffic: the dialer's
      upstream handshakes are covered against loopback test doubles, but the
      `NetworkRouteService → dialer` path has not been exercised live.
- [ ] A browser pointed at `127.0.0.1:<port>` loading real pages.
- [ ] `npm test` fully green: 3 pre-existing environment failures remain
      (`browser-extension/architecture-guard.test.js` listener assertion,
      `src/lab/oneworksAmeowCandidate.test.ts` missing candidate fixture,
      `scripts/verify-ytdlp-baseline-package.test.mts` spawning `npm`).

## Notes

- Scope fixed by user answers (m00112): consumers = local browser / system
  proxy + browser extension (**not** other LAN devices); protocols = HTTP proxy
  (with CONNECT) **and** SOCKS5, both; egress = Ameow's existing network proxy
  settings (manual > system > environment > direct).
- The proxy-resolution contract requires every consumer to go through the one
  `NetworkRouteService`; this task adds `local-proxy` as a new consumer label
  rather than introducing a second routing path.
