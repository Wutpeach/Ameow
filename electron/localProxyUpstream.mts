import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

import {
  redactNetworkCredentials,
  type NetworkRoute,
} from "../src/config/networkRoute.js";

/**
 * Egress dialing for the built-in local proxy listener.
 *
 * The listener never decides where traffic goes: it hands the already-resolved
 * NetworkRoute to this module, which turns it into one connected socket. A
 * `complex` route is refused explicitly rather than silently degraded to
 * direct or to the environment tier.
 */

export const LOCAL_PROXY_UPSTREAM_TIMEOUT_MS = 15_000;

export type LocalProxyEgressFailureReason = "refused" | "unreachable";

export type LocalProxyEgress =
  | { ok: true; socket: Socket; detail: string }
  | { ok: false; reason: LocalProxyEgressFailureReason; detail: string };

export type LocalProxyDialInput = {
  route: NetworkRoute;
  host: string;
  port: number;
  timeoutMs?: number;
};

export type ProxyEndpoint = {
  protocol: "http" | "https" | "socks4" | "socks5";
  host: string;
  port: number;
  username: string;
  password: string;
};

const DEFAULT_PROXY_PORT: Record<ProxyEndpoint["protocol"], number> = {
  http: 80,
  https: 443,
  socks4: 1080,
  socks5: 1080,
};

/** Parses an upstream proxy URL, tolerating the credentials the environment tier allows. */
export const parseProxyEndpoint = (proxyUrl: string): ProxyEndpoint | null => {
  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    return null;
  }

  const protocol = parsed.protocol.replace(":", "");
  if (
    protocol !== "http"
    && protocol !== "https"
    && protocol !== "socks4"
    && protocol !== "socks5"
  ) {
    return null;
  }
  if (!parsed.hostname) {
    return null;
  }

  const port = parsed.port ? Number(parsed.port) : DEFAULT_PROXY_PORT[protocol];
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    return null;
  }

  return {
    protocol,
    host: parsed.hostname,
    port,
    username: parsed.username ? decodeURIComponent(parsed.username) : "",
    password: parsed.password ? decodeURIComponent(parsed.password) : "",
  };
};

export type LocalProxySocketReader = {
  readExactly(byteCount: number): Promise<Buffer>;
  readUntil(delimiter: Buffer): Promise<Buffer>;
  /** Detaches the reader and pushes unconsumed bytes back onto the socket. */
  release(): void;
};

type PendingWaiter = {
  attempt: () => Buffer | null;
  resolve: (value: Buffer) => void;
  reject: (error: Error) => void;
};

/**
 * Minimal demand-driven reader over a socket. Proxy handshakes are tiny
 * delimited messages, so the reader consumes exactly what it needs and hands
 * every leftover byte back with `release()` for the tunnel to pipe.
 */
export const createLocalProxySocketReader = (socket: Socket): LocalProxySocketReader => {
  let pendingChunks: Buffer[] = [];
  let pendingLength = 0;
  let waiter: PendingWaiter | null = null;

  const takeFromPending = (measure: (joined: Buffer) => number | null): Buffer | null => {
    if (pendingLength === 0) {
      return null;
    }
    const joined = Buffer.concat(pendingChunks, pendingLength);
    const consumedLength = measure(joined);
    if (consumedLength === null) {
      return null;
    }
    const head = joined.subarray(0, consumedLength);
    const rest = joined.subarray(consumedLength);
    pendingChunks = rest.length > 0 ? [rest] : [];
    pendingLength = rest.length;
    return head;
  };

  const settleWaiter = () => {
    if (!waiter) {
      return;
    }
    const value = waiter.attempt();
    if (!value) {
      return;
    }
    const current = waiter;
    waiter = null;
    current.resolve(value);
  };

  const onData = (chunk: Buffer) => {
    pendingChunks.push(chunk);
    pendingLength += chunk.length;
    settleWaiter();
  };

  const onClose = () => {
    if (!waiter) {
      return;
    }
    const current = waiter;
    waiter = null;
    current.reject(new Error("Upstream connection closed before the handshake completed."));
  };

  socket.on("data", onData);
  socket.on("close", onClose);
  // Creating a reader means bytes are about to be consumed, so a socket paused
  // by the caller (protocol sniffing) must flow again. Attaching a 'data'
  // listener alone does not resume an explicitly paused stream.
  socket.resume();

  const wait = (attempt: () => Buffer | null): Promise<Buffer> => {
    const immediate = attempt();
    if (immediate) {
      return Promise.resolve(immediate);
    }
    return new Promise((resolve, reject) => {
      waiter = { attempt, resolve, reject };
    });
  };

  return {
    readExactly: (byteCount) => wait(() => takeFromPending((joined) => (
      joined.length >= byteCount ? byteCount : null
    ))),
    readUntil: (delimiter) => wait(() => takeFromPending((joined) => {
      const index = joined.indexOf(delimiter);
      return index === -1 ? null : index + delimiter.length;
    })),
    release() {
      socket.off("data", onData);
      socket.off("close", onClose);
      // Pause before replaying leftovers so the bytes stay buffered until the
      // next owner (a protocol handler or the tunnel pipe) attaches.
      socket.pause();
      if (pendingLength > 0) {
        socket.unshift(Buffer.concat(pendingChunks, pendingLength));
        pendingChunks = [];
        pendingLength = 0;
      }
      waiter = null;
    },
  };
};

const connectSocket = (
  options: { host: string; port: number; servername?: string },
  timeoutMs: number,
): Promise<Socket> => new Promise((resolve, reject) => {
  const socket = options.servername
    ? tlsConnect({ host: options.host, port: options.port, servername: options.servername })
    : netConnect({ host: options.host, port: options.port });

  const fail = (error: Error) => {
    clearTimeout(timer);
    socket.destroy();
    reject(error);
  };
  const timer = setTimeout(() => {
    fail(new Error(`Timed out connecting to ${options.host}:${options.port}.`));
  }, timeoutMs);

  const readyEvent = options.servername ? "secureConnect" : "connect";
  socket.once("error", fail);
  socket.once(readyEvent, () => {
    clearTimeout(timer);
    socket.off("error", fail);
    socket.removeAllListeners("error");
    resolve(socket);
  });
});

const describeEndpoint = (host: string, port: number): string => `${host}:${port}`;

const connectDirectly = async (
  host: string,
  port: number,
  timeoutMs: number,
): Promise<LocalProxyEgress> => {
  try {
    const socket = await connectSocket({ host, port }, timeoutMs);
    return { ok: true, socket, detail: `direct -> ${describeEndpoint(host, port)}` };
  } catch (error) {
    return {
      ok: false,
      reason: "unreachable",
      detail: redactNetworkCredentials(
        `Direct connection to ${describeEndpoint(host, port)} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    };
  }
};

const buildProxyAuthorization = (endpoint: ProxyEndpoint): string | null => {
  if (!endpoint.username && !endpoint.password) {
    return null;
  }
  const raw = `${endpoint.username}:${endpoint.password}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
};

/** HTTP/HTTPS upstream: CONNECT tunnel, then the socket carries raw bytes. */
const dialThroughHttpProxy = async (
  endpoint: ProxyEndpoint,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<LocalProxyEgress> => {
  let socket: Socket;
  try {
    socket = await connectSocket(
      {
        host: endpoint.host,
        port: endpoint.port,
        ...(endpoint.protocol === "https" ? { servername: endpoint.host } : {}),
      },
      timeoutMs,
    );
  } catch (error) {
    return {
      ok: false,
      reason: "unreachable",
      detail: redactNetworkCredentials(
        `Upstream proxy ${describeEndpoint(endpoint.host, endpoint.port)} is unreachable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    };
  }

  const reader = createLocalProxySocketReader(socket);
  const authorization = buildProxyAuthorization(endpoint);
  const requestLines = [
    `CONNECT ${describeEndpoint(host, port)} HTTP/1.1`,
    `Host: ${describeEndpoint(host, port)}`,
    "Proxy-Connection: keep-alive",
    ...(authorization ? [`Proxy-Authorization: ${authorization}`] : []),
    "",
    "",
  ];

  try {
    socket.write(requestLines.join("\r\n"));
    const header = await reader.readUntil(Buffer.from("\r\n\r\n"));
    const statusLine = header.toString("latin1").split("\r\n", 1)[0] ?? "";
    const statusMatch = /^HTTP\/1\.[01]\s+(\d{3})/.exec(statusLine);
    if (!statusMatch || Number(statusMatch[1]) < 200 || Number(statusMatch[1]) > 299) {
      reader.release();
      socket.destroy();
      return {
        ok: false,
        reason: "unreachable",
        detail: redactNetworkCredentials(
          `Upstream proxy rejected CONNECT ${describeEndpoint(host, port)}: ${
            statusLine.trim() || "no status line"
          }`,
        ),
      };
    }
    reader.release();
    return {
      ok: true,
      socket,
      detail: `${endpoint.protocol} proxy ${describeEndpoint(endpoint.host, endpoint.port)} -> ${
        describeEndpoint(host, port)
      }`,
    };
  } catch (error) {
    reader.release();
    socket.destroy();
    return {
      ok: false,
      reason: "unreachable",
      detail: redactNetworkCredentials(
        `Upstream proxy handshake for ${describeEndpoint(host, port)} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    };
  }
};

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const parseIpv6Bytes = (host: string): Buffer | null => {
  const withoutZone = host.includes("%") ? host.slice(0, host.indexOf("%")) : host;
  const halves = withoutZone.split("::");
  if (halves.length > 2) {
    return null;
  }
  const parseGroups = (value: string): number[] | null => {
    if (!value) {
      return [];
    }
    const groups: number[] = [];
    for (const group of value.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
        return null;
      }
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };

  const head = parseGroups(halves[0] ?? "");
  if (!head) {
    return null;
  }
  if (halves.length === 1) {
    if (head.length !== 8) {
      return null;
    }
    return Buffer.from(head.flatMap((group) => [group >> 8, group & 0xff]));
  }

  const tail = parseGroups(halves[1] ?? "");
  if (!tail) {
    return null;
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 1) {
    return null;
  }
  const groups = [...head, ...new Array<number>(missing).fill(0), ...tail];
  return Buffer.from(groups.flatMap((group) => [group >> 8, group & 0xff]));
};

/** SOCKS5 ATYP-tagged destination address. */
const encodeSocks5Address = (host: string): Buffer | null => {
  const ipv4 = IPV4_PATTERN.exec(host);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) {
      return null;
    }
    return Buffer.from([0x01, ...octets]);
  }
  if (host.includes(":")) {
    const bytes = parseIpv6Bytes(host);
    return bytes ? Buffer.concat([Buffer.from([0x04]), bytes]) : null;
  }
  const domain = Buffer.from(host, "utf8");
  if (domain.length === 0 || domain.length > 255) {
    return null;
  }
  return Buffer.concat([Buffer.from([0x03, domain.length]), domain]);
};

const SOCKS5_REPLY_LABEL: Record<number, string> = {
  0x01: "general SOCKS server failure",
  0x02: "connection not allowed by ruleset",
  0x03: "network unreachable",
  0x04: "host unreachable",
  0x05: "connection refused",
  0x06: "TTL expired",
  0x07: "command not supported",
  0x08: "address type not supported",
};

const dialThroughSocks5Proxy = async (
  endpoint: ProxyEndpoint,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<LocalProxyEgress> => {
  const target = encodeSocks5Address(host);
  if (!target) {
    return { ok: false, reason: "refused", detail: `Unsupported SOCKS5 target address: ${host}` };
  }

  let socket: Socket;
  try {
    socket = await connectSocket(
      { host: endpoint.host, port: endpoint.port },
      timeoutMs,
    );
  } catch (error) {
    return {
      ok: false,
      reason: "unreachable",
      detail: redactNetworkCredentials(
        `Upstream SOCKS5 proxy ${describeEndpoint(endpoint.host, endpoint.port)} is unreachable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    };
  }

  const reader = createLocalProxySocketReader(socket);
  const useCredentials = Boolean(endpoint.username || endpoint.password);

  const abort = (detail: string): LocalProxyEgress => {
    reader.release();
    socket.destroy();
    return { ok: false, reason: "unreachable", detail };
  };

  try {
    socket.write(
      useCredentials
        ? Buffer.from([0x05, 0x02, 0x00, 0x02])
        : Buffer.from([0x05, 0x01, 0x00]),
    );
    const greeting = await reader.readExactly(2);
    if (greeting[0] !== 0x05) {
      return abort("Upstream SOCKS5 proxy answered with an unexpected version.");
    }
    if (greeting[1] === 0xff) {
      return abort("Upstream SOCKS5 proxy rejected every offered authentication method.");
    }
    if (greeting[1] === 0x02) {
      const username = Buffer.from(endpoint.username, "utf8");
      const password = Buffer.from(endpoint.password, "utf8");
      socket.write(Buffer.concat([
        Buffer.from([0x01, username.length]),
        username,
        Buffer.from([password.length]),
        password,
      ]));
      const authReply = await reader.readExactly(2);
      if (authReply[1] !== 0x00) {
        return abort("Upstream SOCKS5 proxy rejected the configured credentials.");
      }
    } else if (greeting[1] !== 0x00) {
      return abort(`Upstream SOCKS5 proxy selected unsupported method 0x${greeting[1].toString(16)}.`);
    }

    socket.write(Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00]),
      target,
      Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    ]));

    const reply = await reader.readExactly(4);
    if (reply[1] !== 0x00) {
      return abort(
        `Upstream SOCKS5 proxy refused the tunnel: ${
          SOCKS5_REPLY_LABEL[reply[1]] ?? `reply 0x${reply[1].toString(16)}`
        }.`,
      );
    }
    const boundLength = reply[3] === 0x01 ? 4 : reply[3] === 0x04 ? 16 : -1;
    if (boundLength > 0) {
      await reader.readExactly(boundLength);
    } else if (reply[3] === 0x03) {
      const domainLength = (await reader.readExactly(1))[0];
      await reader.readExactly(domainLength);
    } else {
      return abort("Upstream SOCKS5 proxy answered with an unsupported address type.");
    }
    await reader.readExactly(2);

    reader.release();
    return {
      ok: true,
      socket,
      detail: `socks5 proxy ${describeEndpoint(endpoint.host, endpoint.port)} -> ${
        describeEndpoint(host, port)
      }`,
    };
  } catch (error) {
    return abort(
      redactNetworkCredentials(
        `Upstream SOCKS5 handshake for ${describeEndpoint(host, port)} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }
};

const dialThroughSocks4Proxy = async (
  endpoint: ProxyEndpoint,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<LocalProxyEgress> => {
  let socket: Socket;
  try {
    socket = await connectSocket(
      { host: endpoint.host, port: endpoint.port },
      timeoutMs,
    );
  } catch (error) {
    return {
      ok: false,
      reason: "unreachable",
      detail: redactNetworkCredentials(
        `Upstream SOCKS4 proxy ${describeEndpoint(endpoint.host, endpoint.port)} is unreachable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    };
  }

  const reader = createLocalProxySocketReader(socket);
  const abort = (detail: string): LocalProxyEgress => {
    reader.release();
    socket.destroy();
    return { ok: false, reason: "unreachable", detail };
  };

  const ipv4 = IPV4_PATTERN.exec(host);
  let addressBytes: Buffer;
  let suffix: Buffer;
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) {
      return { ok: false, reason: "refused", detail: `Unsupported SOCKS4 target address: ${host}` };
    }
    addressBytes = Buffer.from(octets);
    suffix = Buffer.from([0x00]);
  } else if (host.includes(":")) {
    return { ok: false, reason: "refused", detail: `SOCKS4 cannot address IPv6 target: ${host}` };
  } else {
    // SOCKS4a: null IPv4 plus the hostname after the user id.
    addressBytes = Buffer.from([0x00, 0x00, 0x00, 0x01]);
    suffix = Buffer.from([0x00, ...Buffer.from(host, "utf8"), 0x00]);
  }

  try {
    socket.write(Buffer.concat([
      Buffer.from([0x04, 0x01, (port >> 8) & 0xff, port & 0xff]),
      addressBytes,
      suffix,
    ]));
    const reply = await reader.readExactly(8);
    if (reply[1] !== 0x5a) {
      return abort(`Upstream SOCKS4 proxy refused the tunnel (reply 0x${reply[1].toString(16)}).`);
    }
    reader.release();
    return {
      ok: true,
      socket,
      detail: `socks4 proxy ${describeEndpoint(endpoint.host, endpoint.port)} -> ${
        describeEndpoint(host, port)
      }`,
    };
  } catch (error) {
    return abort(
      redactNetworkCredentials(
        `Upstream SOCKS4 handshake for ${describeEndpoint(host, port)} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }
};

/**
 * Turns one resolved route into a connected socket that already speaks to
 * `host:port`. Every failure is typed so the protocol layer can answer the
 * client without ever falling back to a route the resolver did not choose.
 */
export const dialLocalProxyEgress = async (
  input: LocalProxyDialInput,
): Promise<LocalProxyEgress> => {
  const { route, host, port } = input;
  const timeoutMs = input.timeoutMs ?? LOCAL_PROXY_UPSTREAM_TIMEOUT_MS;

  if (route.mode === "complex") {
    return {
      ok: false,
      reason: "refused",
      detail: `Complex proxy route (${route.reason}) cannot be applied to local proxy egress.`,
    };
  }
  if (route.mode === "direct") {
    return connectDirectly(host, port, timeoutMs);
  }

  const endpoint = parseProxyEndpoint(route.proxyUrl);
  if (!endpoint) {
    return {
      ok: false,
      reason: "refused",
      detail: `Unsupported upstream proxy URL for protocol ${route.protocol}.`,
    };
  }

  switch (endpoint.protocol) {
    case "http":
    case "https":
      return dialThroughHttpProxy(endpoint, host, port, timeoutMs);
    case "socks5":
      return dialThroughSocks5Proxy(endpoint, host, port, timeoutMs);
    case "socks4":
      return dialThroughSocks4Proxy(endpoint, host, port, timeoutMs);
  }
};
