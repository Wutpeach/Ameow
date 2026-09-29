import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createNetServer, type Server as NetServer, type Socket } from "node:net";

import {
  buildLocalProxyAddress,
  createInitialLocalProxyServerState,
  LOCAL_PROXY_HOST,
  type LocalProxyServerConfig,
  type LocalProxyServerState,
} from "../src/config/localProxyServer.js";
import {
  handleLocalProxyHttpConnect,
  handleLocalProxyHttpRequest,
  handleLocalProxySocks5,
  parseLocalProxyConnectTarget,
  rejectLocalProxySocks4,
  type LocalProxyDialFn,
} from "./localProxyProtocol.mjs";
import { createLocalProxySocketReader } from "./localProxyUpstream.mjs";

/**
 * The built-in local proxy listener: one loopback TCP port that serves HTTP
 * proxy clients and SOCKS5 clients from the same socket, chosen by sniffing the
 * first byte (0x05 = SOCKS5, 0x04 = SOCKS4, anything else = HTTP).
 *
 * The listener owns no routing logic. It calls the injected dial function for
 * every connection, so the single NetworkRouteService remains the only place
 * that decides where traffic leaves the machine.
 */

export const LOCAL_PROXY_CONNECTION_STATE_THROTTLE_MS = 250;

export type LocalProxyServerDependencies = {
  dial: LocalProxyDialFn;
  log: (message: string) => void;
  onStateChanged: (state: LocalProxyServerState) => void;
  now?: () => number;
};

export type LocalProxyServer = {
  /** Binds the listener; the process keeps serving until `stop`. */
  start(config: LocalProxyServerConfig): Promise<LocalProxyServerState>;
  /** Unbinds the listener and drops live tunnels. */
  stop(): Promise<LocalProxyServerState>;
  getState(): LocalProxyServerState;
};

const errorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

export const createLocalProxyServer = (
  dependencies: LocalProxyServerDependencies,
): LocalProxyServer => {
  const now = dependencies.now ?? (() => Date.now());
  const log = dependencies.log;

  let state: LocalProxyServerState = createInitialLocalProxyServerState(
    { enabled: false, port: 0 },
    now(),
  );
  let netServer: NetServer | null = null;
  let startedAtMs: number | null = null;
  let lastError: string | null = null;
  const liveSockets = new Set<Socket>();
  let totalConnections = 0;
  let totalFailures = 0;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  const snapshot = (): LocalProxyServerState => {
    state = {
      ...state,
      running: netServer !== null,
      activeConnections: liveSockets.size,
      totalConnections,
      totalFailures,
      lastError,
      startedAtMs,
      updatedAtMs: now(),
    };
    return state;
  };

  /** Publishes immediately; used for lifecycle changes. */
  const emitState = (): LocalProxyServerState => {
    const next = snapshot();
    dependencies.onStateChanged(next);
    return next;
  };

  /** Coalesces per-connection counter churn into one publish. */
  const scheduleStateEmit = (): void => {
    if (throttleTimer) {
      return;
    }
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      dependencies.onStateChanged(snapshot());
    }, LOCAL_PROXY_CONNECTION_STATE_THROTTLE_MS);
    throttleTimer.unref?.();
  };

  const dialWithAccounting: LocalProxyDialFn = async (target) => {
    const egress = await dependencies.dial(target);
    if (!egress.ok) {
      totalFailures += 1;
      scheduleStateEmit();
    }
    return egress;
  };

  const httpServer: HttpServer = createHttpServer();
  httpServer.on("request", (request, response) => {
    void handleLocalProxyHttpRequest(request, response, dialWithAccounting, log);
  });
  httpServer.on("connect", (request, clientSocket, head) => {
    const target = parseLocalProxyConnectTarget(request.url ?? "");
    if (!target) {
      clientSocket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      log("http CONNECT rejected: malformed request target.");
      return;
    }
    void handleLocalProxyHttpConnect(clientSocket as Socket, target, head, dialWithAccounting, log);
  });
  httpServer.on("clientError", (_error, socket) => {
    socket.destroy();
  });

  const handleClient = async (socket: Socket): Promise<void> => {
    const reader = createLocalProxySocketReader(socket);
    let firstByte: number;
    try {
      firstByte = (await reader.readExactly(1))[0] ?? -1;
    } catch {
      reader.release();
      socket.destroy();
      return;
    }
    reader.release();
    // Hand the socket over paused and byte-complete: the sniffed byte is
    // replayed in front of the leftovers so the protocol handler reads from
    // byte zero. `release()` unshifts first, so prepending stays ordered.
    socket.pause();
    socket.unshift(Buffer.from([firstByte]));

    if (firstByte === 0x05) {
      await handleLocalProxySocks5(socket, dialWithAccounting, log);
      return;
    }
    if (firstByte === 0x04) {
      rejectLocalProxySocks4(socket, log);
      return;
    }
    // Attach the HTTP parser first, then let the socket flow: the parser's
    // 'data' listener is what the replay of the sniffed byte must reach.
    httpServer.emit("connection", socket);
    socket.resume();
  };

  const handleConnection = (socket: Socket): void => {
    liveSockets.add(socket);
    totalConnections += 1;
    scheduleStateEmit();
    socket.on("close", () => {
      liveSockets.delete(socket);
      scheduleStateEmit();
    });
    socket.on("error", () => {
      socket.destroy();
    });
    void handleClient(socket);
  };

  const bind = async (config: LocalProxyServerConfig): Promise<number> => {
    const server = createNetServer();
    server.on("connection", handleConnection);
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(config.port, LOCAL_PROXY_HOST);
    });
    netServer = server;
    const address = server.address();
    return typeof address === "object" && address !== null ? address.port : config.port;
  };

  const stop = async (): Promise<LocalProxyServerState> => {
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    const server = netServer;
    netServer = null;
    startedAtMs = null;
    if (server) {
      for (const socket of liveSockets) {
        socket.destroy();
      }
      liveSockets.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    return emitState();
  };

  const start = async (config: LocalProxyServerConfig): Promise<LocalProxyServerState> => {
    if (netServer && state.port === config.port) {
      state = { ...state, enabled: config.enabled };
      return emitState();
    }
    if (netServer) {
      await stop();
    }

    state = {
      ...state,
      enabled: config.enabled,
      running: false,
      port: config.port,
      address: buildLocalProxyAddress(config.port),
      httpProxyUrl: `http://${buildLocalProxyAddress(config.port)}`,
      socksProxyUrl: `socks5://${buildLocalProxyAddress(config.port)}`,
    };
    lastError = null;

    let boundPort: number;
    try {
      boundPort = await bind(config);
    } catch (error) {
      lastError = `Cannot listen on ${buildLocalProxyAddress(config.port)}: ${errorMessage(error)}`;
      log(lastError);
      return emitState();
    }

    // The port is reported from the bound socket so an ephemeral bind (port 0)
    // still yields a reachable address.
    state = {
      ...state,
      port: boundPort,
      address: buildLocalProxyAddress(boundPort),
      httpProxyUrl: `http://${buildLocalProxyAddress(boundPort)}`,
      socksProxyUrl: `socks5://${buildLocalProxyAddress(boundPort)}`,
    };
    startedAtMs = now();
    log(`Local proxy listening on ${state.httpProxyUrl} (HTTP + SOCKS5).`);
    return emitState();
  };

  return {
    start,
    stop,
    getState: () => snapshot(),
  };
};
