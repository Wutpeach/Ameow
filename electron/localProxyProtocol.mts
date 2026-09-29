import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";

import {
  createLocalProxySocketReader,
  type LocalProxyEgress,
  type LocalProxySocketReader,
} from "./localProxyUpstream.mjs";

/**
 * Client-facing proxy protocols for the built-in local listener.
 *
 * The protocol layer owns byte-level handshakes only. Every routing decision
 * arrives through the injected dial function, so a refused or unreachable
 * egress is reported to the client as a protocol-level failure and never
 * retried against a different route.
 */

export type LocalProxyTarget = {
  host: string;
  port: number;
};

export type LocalProxyDialFn = (target: LocalProxyTarget) => Promise<LocalProxyEgress>;

export const LOCAL_PROXY_SOCKS_VERSION = 0x05;

const SOCKS5_REPLY = {
  succeeded: 0x00,
  notAllowed: 0x02,
  hostUnreachable: 0x04,
  commandNotSupported: 0x07,
  addressNotSupported: 0x08,
} as const;

const SOCKS4_REPLY_REJECTED = 0x5b;

const writeSocks5Reply = (socket: Socket, reply: number): void => {
  socket.write(Buffer.from([LOCAL_PROXY_SOCKS_VERSION, reply, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
};

const rejectSocks5 = (socket: Socket, reply: number, detail: string, log: (message: string) => void): void => {
  writeSocks5Reply(socket, reply);
  socket.end();
  log(detail);
};

const ipv6BytesToString = (bytes: Buffer): string => {
  const groups: string[] = [];
  for (let index = 0; index < 16; index += 2) {
    groups.push((((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0)).toString(16));
  }
  return groups.join(":");
};

const readSocks5Target = async (
  reader: LocalProxySocketReader,
  addressType: number,
): Promise<LocalProxyTarget | null> => {
  let host: string;
  if (addressType === 0x01) {
    host = [...await reader.readExactly(4)].join(".");
  } else if (addressType === 0x03) {
    const length = (await reader.readExactly(1))[0] ?? 0;
    if (length === 0) {
      return null;
    }
    host = (await reader.readExactly(length)).toString("utf8");
  } else if (addressType === 0x04) {
    host = ipv6BytesToString(await reader.readExactly(16));
  } else {
    return null;
  }

  const portBytes = await reader.readExactly(2);
  return { host, port: ((portBytes[0] ?? 0) << 8) | (portBytes[1] ?? 0) };
};

const pipeTunnel = (client: Socket, upstream: Socket): void => {
  const closeBoth = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on("error", closeBoth);
  upstream.on("error", closeBoth);
  client.on("close", () => upstream.destroy());
  upstream.on("close", () => client.destroy());
  client.pipe(upstream).pipe(client);
};

/**
 * Serves one SOCKS5 client: method negotiation, CONNECT request, then a raw
 * tunnel. Only the no-authentication method is offered because the listener is
 * bound to the loopback interface.
 */
export const handleLocalProxySocks5 = async (
  socket: Socket,
  dial: LocalProxyDialFn,
  log: (message: string) => void,
): Promise<void> => {
  const reader = createLocalProxySocketReader(socket);
  try {
    const greeting = await reader.readExactly(2);
    if (greeting[0] !== LOCAL_PROXY_SOCKS_VERSION) {
      socket.destroy();
      return;
    }

    const methodCount = greeting[1] ?? 0;
    const methods = methodCount > 0 ? await reader.readExactly(methodCount) : Buffer.alloc(0);
    if (!methods.includes(0x00)) {
      socket.write(Buffer.from([LOCAL_PROXY_SOCKS_VERSION, 0xff]));
      socket.end();
      log("socks5 client offered no supported authentication method.");
      return;
    }
    socket.write(Buffer.from([LOCAL_PROXY_SOCKS_VERSION, 0x00]));

    const header = await reader.readExactly(4);
    if (header[0] !== LOCAL_PROXY_SOCKS_VERSION) {
      socket.destroy();
      return;
    }
    if (header[1] !== 0x01) {
      reader.release();
      rejectSocks5(socket, SOCKS5_REPLY.commandNotSupported, "socks5 client requested an unsupported command.", log);
      return;
    }

    const target = await readSocks5Target(reader, header[3] ?? 0);
    if (!target) {
      reader.release();
      rejectSocks5(socket, SOCKS5_REPLY.addressNotSupported, "socks5 client used an unsupported address type.", log);
      return;
    }

    const egress = await dial(target);
    if (!egress.ok) {
      reader.release();
      rejectSocks5(
        socket,
        egress.reason === "refused" ? SOCKS5_REPLY.notAllowed : SOCKS5_REPLY.hostUnreachable,
        `socks5 egress to ${target.host}:${target.port} failed: ${egress.detail}`,
        log,
      );
      return;
    }

    writeSocks5Reply(socket, SOCKS5_REPLY.succeeded);
    reader.release();
    log(`socks5 tunnel established to ${target.host}:${target.port} (${egress.detail}).`);
    pipeTunnel(socket, egress.socket);
  } catch (error) {
    // A client that disappears mid-handshake is not an application failure.
    void error;
    socket.destroy();
  }
};

/** Answers SOCKS4 clients with an explicit rejection instead of guessing. */
export const rejectLocalProxySocks4 = (socket: Socket, log: (message: string) => void): void => {
  socket.write(Buffer.from([0x00, SOCKS4_REPLY_REJECTED, 0, 0, 0, 0, 0, 0]));
  socket.end();
  log("socks4 client rejected: Ameow local proxy supports HTTP and SOCKS5 only.");
};

export type LocalProxyHttpTarget = {
  host: string;
  port: number;
  path: string;
};

/**
 * Resolves the authority of an HTTP `CONNECT host:port` request line, including
 * the bracketed IPv6 form.
 */
export const parseLocalProxyConnectTarget = (authority: string): LocalProxyTarget | null => {
  const separator = authority.lastIndexOf(":");
  if (separator <= 0) {
    return null;
  }
  const host = authority.slice(0, separator).replace(/^\[/, "").replace(/\]$/, "");
  const port = Number(authority.slice(separator + 1));
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65_535) {
    return null;
  }
  return { host, port };
};

/**
 * Resolves the upstream target for a plain (non-CONNECT) proxy request, which
 * arrives either as an absolute URI or as a relative path plus a Host header.
 */
export const parseLocalProxyHttpTarget = (
  requestUrl: string,
  hostHeader: string | undefined,
): LocalProxyHttpTarget | null => {
  if (/^https?:\/\//i.test(requestUrl)) {
    try {
      const parsed = new URL(requestUrl);
      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80,
        path: `${parsed.pathname}${parsed.search}`,
      };
    } catch {
      return null;
    }
  }

  if (!hostHeader) {
    return null;
  }
  try {
    const parsed = new URL(`http://${hostHeader}`);
    const port = parsed.port ? Number(parsed.port) : 80;
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      return null;
    }
    return { host: parsed.hostname, port, path: requestUrl || "/" };
  } catch {
    return null;
  }
};

const writeHttpProxyError = (socket: Socket, status: number, reason: string, detail: string): void => {
  const body = `Ameow local proxy: ${detail}`;
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\n`
    + "Content-Type: text/plain; charset=utf-8\r\n"
    + `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n`
    + "Connection: close\r\n\r\n"
    + body,
  );
};

/** Handles `CONNECT host:port` by opening the tunnel and replaying any head bytes. */
export const handleLocalProxyHttpConnect = async (
  clientSocket: Socket,
  target: LocalProxyTarget,
  head: Buffer,
  dial: LocalProxyDialFn,
  log: (message: string) => void,
): Promise<void> => {
  const egress = await dial({ host: target.host, port: target.port });
  if (!egress.ok) {
    writeHttpProxyError(clientSocket, 502, "Bad Gateway", egress.detail);
    log(`http CONNECT to ${target.host}:${target.port} failed: ${egress.detail}`);
    return;
  }

  clientSocket.write("HTTP/1.1 200 Connection Established\r\nProxy-Agent: Ameow\r\n\r\n");
  if (head.length > 0) {
    egress.socket.write(head);
  }
  log(`http CONNECT tunnel established to ${target.host}:${target.port} (${egress.detail}).`);
  pipeTunnel(clientSocket, egress.socket);
};

/** Forwards one plain HTTP request over the resolved route. */
export const handleLocalProxyHttpRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  dial: LocalProxyDialFn,
  log: (message: string) => void,
): Promise<void> => {
  const target = parseLocalProxyHttpTarget(req.url ?? "", req.headers.host);
  if (!target) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8", connection: "close" });
    res.end("Ameow local proxy: malformed request target.");
    return;
  }

  const egress = await dial({ host: target.host, port: target.port });
  if (!egress.ok) {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8", connection: "close" });
    res.end(`Ameow local proxy: ${egress.detail}`);
    log(`http ${req.method ?? "GET"} to ${target.host}:${target.port} failed: ${egress.detail}`);
    return;
  }

  const headers = { ...req.headers };
  delete headers["proxy-connection"];
  delete headers["proxy-authorization"];

  const upstream = httpRequest({
    host: target.host,
    port: target.port,
    method: req.method,
    path: target.path,
    headers,
    agent: false,
    createConnection: () => egress.socket,
  });

  upstream.on("error", (error: Error) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8", connection: "close" });
    }
    res.end(`Ameow local proxy: ${error.message}`);
    egress.socket.destroy();
  });
  upstream.on("response", (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });

  req.pipe(upstream);
};
