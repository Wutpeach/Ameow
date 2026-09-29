/**
 * Framework-neutral configuration and state model for Ameow's built-in local
 * proxy listener.
 *
 * The listener is a loopback-only mixed port: one TCP port answers HTTP proxy
 * clients (absolute-form requests and CONNECT tunnels) and SOCKS5 clients
 * alike. Routing is never decided in this module — every connection resolves
 * its own route through the single NetworkRouteService under the
 * `local-proxy` consumer label, so this module stays free of Electron and of
 * any ambient proxy state.
 */

import type { NetworkRoute } from "./networkRoute.js";

/** Loopback only: the listener is never reachable from the LAN. */
export const LOCAL_PROXY_HOST = "127.0.0.1";

/**
 * Loopback aliases a self-route check has to recognise. A user who pastes the
 * listener's own address into the network-proxy setting would otherwise make
 * every connection dial itself.
 */
const LOCAL_PROXY_LOOPBACK_ALIASES = new Set(["127.0.0.1", "localhost", "::1"]);

export const DEFAULT_LOCAL_PROXY_PORT = 21080;

/** Ports below 1024 need elevated privileges on every supported platform. */
export const LOCAL_PROXY_PORT_MIN = 1024;
export const LOCAL_PROXY_PORT_MAX = 65535;

/**
 * Consumer label handed to NetworkRouteService. It is a plain string (the
 * NetworkConsumer union is open) so route diagnostics can name the local proxy
 * without widening the built-in union.
 */
export const LOCAL_PROXY_CONSUMER = "local-proxy";

/** Persisted settings.json keys, flat to match networkProxyMode/Url. */
export const LOCAL_PROXY_CONFIG_KEYS = {
  enabled: "localProxyEnabled",
  port: "localProxyPort",
} as const;

export type LocalProxyServerConfig = {
  /** Persisted intent; the listener only runs while this is true. */
  enabled: boolean;
  port: number;
};

export type LocalProxyServerState = {
  /** Configured intent. */
  enabled: boolean;
  /** Actual listener state; false while disabled or after a bind failure. */
  running: boolean;
  address: string;
  port: number;
  /** Ready-to-paste client configuration strings. */
  httpProxyUrl: string;
  socksProxyUrl: string;
  activeConnections: number;
  totalConnections: number;
  totalFailures: number;
  /** Redacted; never carries upstream proxy credentials. */
  lastError: string | null;
  startedAtMs: number | null;
  updatedAtMs: number;
};

export const isValidLocalProxyPort = (value: unknown): value is number => (
  typeof value === "number"
  && Number.isInteger(value)
  && value >= LOCAL_PROXY_PORT_MIN
  && value <= LOCAL_PROXY_PORT_MAX
);

/**
 * Reads the persisted listener settings, falling back per field so a malformed
 * port never disables an otherwise valid intent (and vice versa).
 */
export const normalizeLocalProxyServerConfig = (
  config: Record<string, unknown>,
): LocalProxyServerConfig => {
  // Read the port into a local first: a type predicate cannot narrow an
  // indexed access through a non-const key.
  const port = config[LOCAL_PROXY_CONFIG_KEYS.port];
  return {
    enabled: config[LOCAL_PROXY_CONFIG_KEYS.enabled] === true,
    port: isValidLocalProxyPort(port) ? port : DEFAULT_LOCAL_PROXY_PORT,
  };
};

/**
 * Canonical URL handed to NetworkRouteService for one proxy target authority.
 *
 * CONNECT and SOCKS carry no scheme, but the environment tier keys off it
 * (`HTTPS_PROXY` vs `HTTP_PROXY`), so port 80 maps to http and every other
 * port to https — which is what browsers actually tunnel.
 */
export const buildLocalProxyTargetUrl = (host: string, port: number): string => {
  const authority = host.includes(":") ? `[${host}]` : host;
  const scheme = port === 80 ? "http" : "https";
  return `${scheme}://${authority}:${port}/`;
};

export const buildLocalProxyAddress = (port: number): string => (
  `${LOCAL_PROXY_HOST}:${port}`
);

/**
 * True when a resolved upstream route points back at this listener. Every
 * connection would otherwise dial itself, so callers refuse the route instead
 * of looping.
 */
export const isLocalProxySelfRoute = (
  route: NetworkRoute,
  listener: { port: number },
): boolean => {
  if (route.mode !== "proxy") {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(route.proxyUrl);
  } catch {
    return false;
  }
  const host = parsed.hostname.replace(/^\[/u, "").replace(/\]$/u, "").toLowerCase();
  if (!LOCAL_PROXY_LOOPBACK_ALIASES.has(host)) {
    return false;
  }
  const port = parsed.port.length > 0
    ? Number(parsed.port)
    : parsed.protocol === "https:" ? 443 : 80;
  return port === listener.port;
};

export const createInitialLocalProxyServerState = (
  config: LocalProxyServerConfig,
  now: number,
): LocalProxyServerState => ({
  enabled: config.enabled,
  running: false,
  address: buildLocalProxyAddress(config.port),
  port: config.port,
  httpProxyUrl: `http://${buildLocalProxyAddress(config.port)}`,
  socksProxyUrl: `socks5://${buildLocalProxyAddress(config.port)}`,
  activeConnections: 0,
  totalConnections: 0,
  totalFailures: 0,
  lastError: null,
  startedAtMs: null,
  updatedAtMs: now,
});
