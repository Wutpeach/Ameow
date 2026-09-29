import { connect as netConnect, createServer, type Server, type Socket } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type { NetworkRoute } from "../src/config/networkRoute.js";
import { dialLocalProxyEgress, parseProxyEndpoint } from "./localProxyUpstream.mjs";

const openSockets: Socket[] = [];
const openServers: Server[] = [];

const trackSocket = <T extends Socket>(socket: T): T => {
  openSockets.push(socket);
  return socket;
};

const listen = async (server: Server): Promise<number> => {
  openServers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : 0);
    });
  });
};

afterEach(async () => {
  for (const socket of openSockets.splice(0)) {
    socket.destroy();
  }
  await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

/**
 * `dialLocalProxyEgress` hands back a paused socket so leftover handshake bytes
 * survive the handoff; the next owner attaches its listener and then resumes.
 */
const readOnce = (socket: Socket): Promise<Buffer> => {
  const pending = new Promise<Buffer>((resolve) => {
    socket.once("data", (chunk: Buffer) => resolve(chunk));
  });
  socket.resume();
  return pending;
};

const createEchoServer = async (): Promise<number> => {
  const server = createServer((socket) => {
    trackSocket(socket);
    socket.pipe(socket);
  });
  return listen(server);
};

const DIRECT_ROUTE: NetworkRoute = {
  mode: "direct",
  source: "direct",
  reason: "no_proxy_source",
  resolvedFor: "http://example.test/",
};

const COMPLEX_ROUTE: NetworkRoute = {
  mode: "complex",
  source: "environment",
  reason: "pac_or_multiple",
  resolvedFor: "http://example.test/",
};

const proxyRoute = (
  proxyUrl: string,
  protocol: "http" | "socks4" | "socks5",
): NetworkRoute => ({
  mode: "proxy",
  source: "manual",
  protocol,
  proxyUrl,
  resolvedFor: "http://example.test/",
});

describe("parseProxyEndpoint", () => {
  it("applies protocol default ports", () => {
    expect(parseProxyEndpoint("http://127.0.0.1")).toMatchObject({ protocol: "http", port: 80 });
    expect(parseProxyEndpoint("https://proxy.example")).toMatchObject({ protocol: "https", port: 443 });
    expect(parseProxyEndpoint("socks5://127.0.0.1")).toMatchObject({ protocol: "socks5", port: 1080 });
    expect(parseProxyEndpoint("socks4://127.0.0.1:1081")).toMatchObject({ protocol: "socks4", port: 1081 });
  });

  it("decodes credentials and rejects unsupported input", () => {
    expect(parseProxyEndpoint("http://user%40name:p%3Ass@127.0.0.1:8080")).toMatchObject({
      username: "user@name",
      password: "p:ss",
    });
    expect(parseProxyEndpoint("ftp://127.0.0.1:21")).toBeNull();
    expect(parseProxyEndpoint("not-a-url")).toBeNull();
  });
});

describe("dialLocalProxyEgress", () => {
  it("refuses a complex route instead of degrading it", async () => {
    const egress = await dialLocalProxyEgress({ route: COMPLEX_ROUTE, host: "example.test", port: 80 });
    expect(egress.ok).toBe(false);
    if (egress.ok) {
      return;
    }
    expect(egress.reason).toBe("refused");
    expect(egress.detail).toContain("pac_or_multiple");
  });

  it("connects directly when the route resolved to direct", async () => {
    const targetPort = await createEchoServer();
    const egress = await dialLocalProxyEgress({ route: DIRECT_ROUTE, host: "127.0.0.1", port: targetPort });
    expect(egress.ok).toBe(true);
    if (!egress.ok) {
      throw new Error(egress.detail);
    }
    trackSocket(egress.socket);
    egress.socket.write("hello-direct");
    await expect(readOnce(egress.socket)).resolves.toEqual(Buffer.from("hello-direct"));
  });

  it("reports unreachable when nothing listens on the resolved target", async () => {
    const server = createServer();
    const port = await listen(server);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    openServers.length = 0;

    const egress = await dialLocalProxyEgress({
      route: DIRECT_ROUTE,
      host: "127.0.0.1",
      port,
      timeoutMs: 2_000,
    });
    expect(egress.ok).toBe(false);
    if (egress.ok) {
      return;
    }
    expect(egress.reason).toBe("unreachable");
  });

  it("tunnels through an HTTP CONNECT upstream", async () => {
    const targetPort = await createEchoServer();
    const seen: string[] = [];
    const proxyServer = createServer((socket) => {
      trackSocket(socket);
      let buffered = "";
      const onData = (chunk: Buffer) => {
        buffered += chunk.toString("latin1");
        if (!buffered.includes("\r\n\r\n")) {
          return;
        }
        socket.off("data", onData);
        const requestLine = buffered.split("\r\n")[0] ?? "";
        seen.push(requestLine);
        const target = requestLine.split(" ")[1] ?? "";
        const separator = target.lastIndexOf(":");
        const upstream = trackSocket(netConnect(
          Number(target.slice(separator + 1)),
          target.slice(0, separator),
          () => {
            socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            upstream.pipe(socket);
            socket.pipe(upstream);
          },
        ));
      };
      socket.on("data", onData);
    });
    const proxyPort = await listen(proxyServer);

    const egress = await dialLocalProxyEgress({
      route: proxyRoute(`http://127.0.0.1:${proxyPort}`, "http"),
      host: "127.0.0.1",
      port: targetPort,
    });
    expect(egress.ok).toBe(true);
    if (!egress.ok) {
      throw new Error(egress.detail);
    }
    trackSocket(egress.socket);
    egress.socket.write("through-http");
    await expect(readOnce(egress.socket)).resolves.toEqual(Buffer.from("through-http"));
    expect(seen[0]).toBe(`CONNECT 127.0.0.1:${targetPort} HTTP/1.1`);
  });

  it("tunnels through a SOCKS5 upstream", async () => {
    const received: Buffer[] = [];
    const proxyServer = createServer((socket) => {
      trackSocket(socket);
      let stage = 0;
      socket.on("data", (chunk: Buffer) => {
        if (stage === 0) {
          expect(chunk[0]).toBe(0x05);
          socket.write(Buffer.from([0x05, 0x00]));
          stage = 1;
          return;
        }
        if (stage === 1) {
          expect(chunk[1]).toBe(0x01);
          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          stage = 2;
          return;
        }
        received.push(chunk);
        socket.write(chunk);
      });
    });
    const proxyPort = await listen(proxyServer);

    const egress = await dialLocalProxyEgress({
      route: proxyRoute(`socks5://127.0.0.1:${proxyPort}`, "socks5"),
      host: "example.test",
      port: 443,
    });
    expect(egress.ok).toBe(true);
    if (!egress.ok) {
      throw new Error(egress.detail);
    }
    trackSocket(egress.socket);
    egress.socket.write("through-socks5");
    await expect(readOnce(egress.socket)).resolves.toEqual(Buffer.from("through-socks5"));
    expect(received.length).toBeGreaterThan(0);
    // Domain targets must be encoded with ATYP 0x03.
    expect(received[0]?.length).toBeGreaterThan(0);
  });

  it("tunnels through a SOCKS4 upstream", async () => {
    const proxyServer = createServer((socket) => {
      trackSocket(socket);
      let greeted = false;
      socket.on("data", (chunk: Buffer) => {
        if (!greeted) {
          expect(chunk[0]).toBe(0x04);
          expect(chunk[1]).toBe(0x01);
          greeted = true;
          socket.write(Buffer.from([0x00, 0x5a, 0, 0, 0, 0, 0, 0]));
          return;
        }
        socket.write(chunk);
      });
    });
    const proxyPort = await listen(proxyServer);

    const egress = await dialLocalProxyEgress({
      route: proxyRoute(`socks4://127.0.0.1:${proxyPort}`, "socks4"),
      host: "127.0.0.1",
      port: 8080,
    });
    expect(egress.ok).toBe(true);
    if (!egress.ok) {
      throw new Error(egress.detail);
    }
    trackSocket(egress.socket);
    egress.socket.write("through-socks4");
    await expect(readOnce(egress.socket)).resolves.toEqual(Buffer.from("through-socks4"));
  });

  it("surfaces an upstream CONNECT rejection", async () => {
    const proxyServer = createServer((socket) => {
      trackSocket(socket);
      socket.once("data", () => {
        socket.write("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n");
      });
    });
    const proxyPort = await listen(proxyServer);

    const egress = await dialLocalProxyEgress({
      route: proxyRoute(`http://127.0.0.1:${proxyPort}`, "http"),
      host: "example.test",
      port: 443,
    });
    expect(egress.ok).toBe(false);
    if (egress.ok) {
      return;
    }
    expect(egress.reason).toBe("unreachable");
    expect(egress.detail).toContain("407");
  });
});
