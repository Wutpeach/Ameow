import { connect as netConnect, createServer, type Server, type Socket } from "node:net";
import { createServer as createHttpServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import type { NetworkRoute } from "../src/config/networkRoute.js";
import type { LocalProxyServerState } from "../src/config/localProxyServer.js";
import type { LocalProxyDialFn } from "./localProxyProtocol.mjs";
import { createLocalProxyServer, type LocalProxyServer } from "./localProxyServer.mjs";
import { dialLocalProxyEgress } from "./localProxyUpstream.mjs";

const openSockets: Socket[] = [];
const openServers: Server[] = [];
const openProxies: LocalProxyServer[] = [];

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
  for (const proxy of openProxies.splice(0)) {
    await proxy.stop();
  }
  for (const socket of openSockets.splice(0)) {
    socket.destroy();
  }
  await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve) => {
    // Upstream sockets opened through the dialer are owned by the library, so a
    // keep-alive connection would otherwise hold `close()` open forever.
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    server.close(() => resolve());
  })));
});

const DIRECT_ROUTE: NetworkRoute = {
  mode: "direct",
  source: "direct",
  reason: "no_proxy_source",
  resolvedFor: "http://127.0.0.1/",
};

const directDial: LocalProxyDialFn = ({ host, port }) => dialLocalProxyEgress({
  route: DIRECT_ROUTE,
  host,
  port,
  timeoutMs: 2_000,
});

const createEchoServer = async (): Promise<number> => {
  const server = createServer((socket) => {
    trackSocket(socket);
    socket.pipe(socket);
  });
  return listen(server);
};

/** Reserves a port and immediately frees it, for "nothing listens here" cases. */
const reserveClosedPort = async (): Promise<number> => {
  const server = createServer();
  const port = await listen(server);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  openServers.length = 0;
  return port;
};

const startProxy = async (
  dial: LocalProxyDialFn = directDial,
): Promise<{ proxy: LocalProxyServer; state: LocalProxyServerState }> => {
  const proxy = createLocalProxyServer({ dial, log: () => {}, onStateChanged: () => {} });
  openProxies.push(proxy);
  const state = await proxy.start({ enabled: true, port: 0 });
  return { proxy, state };
};

const connectClient = (port: number): Promise<Socket> => new Promise((resolve, reject) => {
  const socket = netConnect(port, "127.0.0.1", () => resolve(trackSocket(socket)));
  socket.once("error", reject);
});

const collectUntil = (socket: Socket, isDone: (buffer: Buffer) => boolean): Promise<Buffer> => (
  new Promise((resolve) => {
    let accumulated = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      accumulated = Buffer.concat([accumulated, chunk]);
      if (isDone(accumulated)) {
        socket.off("data", onData);
        resolve(accumulated);
      }
    };
    socket.on("data", onData);
  })
);

const waitFor = async (predicate: () => boolean, timeoutMs = 3_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Condition was not met in time.");
};

describe("createLocalProxyServer", () => {
  it("binds a loopback port and reports ready client URLs", async () => {
    const { state } = await startProxy();
    expect(state.running).toBe(true);
    expect(state.port).toBeGreaterThan(0);
    expect(state.address).toBe(`127.0.0.1:${state.port}`);
    expect(state.httpProxyUrl).toBe(`http://127.0.0.1:${state.port}`);
    expect(state.socksProxyUrl).toBe(`socks5://127.0.0.1:${state.port}`);
    expect(state.lastError).toBeNull();
    expect(state.startedAtMs).not.toBeNull();
  });

  it("reports a bind failure instead of throwing", async () => {
    const blocker = createServer();
    const blockedPort = await listen(blocker);
    const proxy = createLocalProxyServer({ dial: directDial, log: () => {}, onStateChanged: () => {} });
    openProxies.push(proxy);

    const state = await proxy.start({ enabled: true, port: blockedPort });
    expect(state.running).toBe(false);
    expect(state.lastError).toContain("Cannot listen on");
  });

  it("tunnels an HTTP CONNECT request", async () => {
    const echoPort = await createEchoServer();
    const { state } = await startProxy();
    const client = await connectClient(state.port);

    client.write(`CONNECT 127.0.0.1:${echoPort} HTTP/1.1\r\nHost: 127.0.0.1:${echoPort}\r\n\r\n`);
    const handshake = await collectUntil(client, (buffer) => buffer.includes("\r\n\r\n"));
    expect(handshake.toString("latin1")).toContain("200 Connection Established");

    client.write("through-connect");
    const echoed = await collectUntil(client, (buffer) => buffer.toString("latin1").includes("through-connect"));
    expect(echoed.toString("latin1")).toContain("through-connect");
  });

  it("tunnels a SOCKS5 CONNECT on the same port", async () => {
    const echoPort = await createEchoServer();
    const { state } = await startProxy();
    const client = await connectClient(state.port);

    client.write(Buffer.from([0x05, 0x01, 0x00]));
    const greeting = await collectUntil(client, (buffer) => buffer.length >= 2);
    expect([...(greeting.subarray(0, 2))]).toEqual([0x05, 0x00]);

    client.write(Buffer.from([
      0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1,
      (echoPort >> 8) & 0xff, echoPort & 0xff,
    ]));
    const reply = await collectUntil(client, (buffer) => buffer.length >= 10);
    expect(reply[1] ?? -1).toBe(0x00);

    client.write("through-socks5");
    const echoed = await collectUntil(client, (buffer) => buffer.toString("latin1").includes("through-socks5"));
    expect(echoed.toString("latin1")).toContain("through-socks5");
  });

  it("forwards an absolute-form HTTP request", async () => {
    const target = createHttpServer((request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(`target:${request.url ?? ""}`);
    });
    const targetPort = await listen(target);
    const { state } = await startProxy();
    const client = await connectClient(state.port);

    client.write(
      `GET http://127.0.0.1:${targetPort}/hello?x=1 HTTP/1.1\r\n`
      + `Host: 127.0.0.1:${targetPort}\r\n`
      + "Proxy-Connection: close\r\n"
      + "Connection: close\r\n\r\n",
    );

    const response = await collectUntil(
      client,
      (buffer) => buffer.toString("latin1").includes("target:/hello?x=1"),
    );
    expect(response.toString("latin1")).toContain("200 OK");
  });

  it("rejects SOCKS4 clients explicitly", async () => {
    const { state } = await startProxy();
    const client = await connectClient(state.port);

    client.write(Buffer.from([0x04, 0x01, 0x00, 0x50, 127, 0, 0, 1, 0x00]));
    const reply = await collectUntil(client, (buffer) => buffer.length >= 8);
    expect(reply[1] ?? -1).toBe(0x5b);
  });

  it("answers a refused route with 502 and counts the failure", async () => {
    const refusingDial: LocalProxyDialFn = async () => ({
      ok: false,
      reason: "refused",
      detail: "Complex proxy route (pac_or_multiple) cannot be applied to local proxy egress.",
    });
    const { proxy, state } = await startProxy(refusingDial);
    const client = await connectClient(state.port);

    client.write("CONNECT example.test:443 HTTP/1.1\r\nHost: example.test:443\r\n\r\n");
    const response = await collectUntil(client, (buffer) => buffer.includes("\r\n\r\n"));
    expect(response.toString("latin1")).toContain("502 Bad Gateway");

    await waitFor(() => proxy.getState().totalFailures === 1);
  });

  it("tracks active connections while running", async () => {
    const echoPort = await createEchoServer();
    const { proxy, state } = await startProxy();
    const client = await connectClient(state.port);

    client.write(Buffer.from([0x05, 0x01, 0x00]));
    await collectUntil(client, (buffer) => buffer.length >= 2);
    client.write(Buffer.from([
      0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1,
      (echoPort >> 8) & 0xff, echoPort & 0xff,
    ]));
    await collectUntil(client, (buffer) => buffer.length >= 10);

    const current = proxy.getState();
    expect(current.totalConnections).toBe(1);
    expect(current.activeConnections).toBe(1);
  });

  it("frees the port when stopped and can rebind it", async () => {
    const { proxy, state } = await startProxy();
    const port = state.port;

    const stopped = await proxy.stop();
    expect(stopped.running).toBe(false);
    expect(stopped.startedAtMs).toBeNull();

    const restarted = await proxy.start({ enabled: true, port });
    expect(restarted.running).toBe(true);
    expect(restarted.port).toBe(port);
  });

  it("reports the egress failure reason to SOCKS5 clients", async () => {
    const deadPort = await reserveClosedPort();
    const { state } = await startProxy();
    const client = await connectClient(state.port);

    client.write(Buffer.from([0x05, 0x01, 0x00]));
    await collectUntil(client, (buffer) => buffer.length >= 2);
    client.write(Buffer.from([
      0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1,
      (deadPort >> 8) & 0xff, deadPort & 0xff,
    ]));
    const reply = await collectUntil(client, (buffer) => buffer.length >= 10);
    expect(reply[1] ?? -1).toBe(0x04);
  });
});
