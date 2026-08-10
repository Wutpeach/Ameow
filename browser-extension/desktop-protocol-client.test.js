import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const helperPath = path.resolve("browser-extension/desktop-download-protocol.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadProtocol = () => {
  const context = {
    self: {},
    globalThis: {},
    Map,
    Promise,
    setTimeout,
    clearTimeout,
    Date,
    console,
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowDesktopDownloadProtocol;
};

// Fake WebSocket with manual lifecycle control.
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.CONNECTING;
    this.sent = [];
    this.closed = false;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
    if (this.onclose) {
      this.onclose({});
    }
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    if (this.onopen) {
      this.onopen({});
    }
  }

  fail() {
    if (this.onerror) {
      this.onerror({});
    }
  }

  receive(message) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(message) });
    }
  }

  receiveRaw(text) {
    if (this.onmessage) {
      this.onmessage({ data: text });
    }
  }
}

const createHarness = (overrides = {}) => {
  const protocol = loadProtocol();
  const sockets = [];
  const commands = [];
  const states = [];
  const alarms = [];
  const opens = [];
  const closes = [];

  const createSocket = (url) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  };

  const client = protocol.createDesktopProtocolClient({
    createSocket,
    scheduleTimer: setTimeout,
    clearTimer: clearTimeout,
    scheduleReconnectAlarm(delayMs) {
      alarms.push(delayMs);
    },
    clearReconnectAlarm() {
      alarms.length = 0;
    },
    onOpen() {
      opens.push(1);
    },
    onClose() {
      closes.push(1);
    },
    onCommand(message) {
      commands.push(message);
    },
    pollIntervalMs: 1,
    reconnectBaseMs: 20,
    reconnectMaxMs: 50,
    logger: () => {},
    ...overrides,
  });

  client.subscribeConnection((state) => states.push(state));

  const openFirst = async () => {
    const promise = client.connectAndWait(1000, { force: true });
    const socket = sockets.at(-1);
    if (socket) {
      socket.open();
    }
    await promise;
    return socket;
  };

  return {
    protocol,
    client,
    sockets,
    commands,
    states,
    alarms,
    opens,
    closes,
    openFirst,
  };
};

describe("desktop protocol client connection lifecycle", () => {
  it("connects and publishes connection state through subscriptions", async () => {
    const harness = createHarness();
    const { client, sockets, states } = harness;

    const socket = await harness.openFirst();
    expect(socket).toBe(sockets[0]);
    expect(sockets[0].url).toBe("ws://127.0.0.1:39527");
    expect(client.isConnected()).toBe(true);
    expect(client.getConnectionState()).toMatchObject({
      connected: true,
      state: "connected",
    });
    expect(states.some((state) => state.state === "connecting")).toBe(true);
    expect(states.some((state) => state.state === "connected")).toBe(true);
  });

  it("force-replaces a stuck CONNECTING socket", async () => {
    const harness = createHarness();
    const { client, sockets } = harness;

    const first = client.connect({ force: true });
    expect(first.connecting).toBe(true);
    expect(sockets).toHaveLength(1);

    // The socket stays CONNECTING (no onopen); force replacement must not
    // be blocked by it.
    const replaced = client.connect({ force: true });
    expect(sockets).toHaveLength(2);
    expect(sockets[0].closed).toBe(true);
    expect(sockets[0].onclose).toBeNull();
    expect(sockets[0].onmessage).toBeNull();
    expect(sockets[1].readyState).toBe(FakeSocket.CONNECTING);
  });

  it("rejects pending requests exactly once when a generation is retired", async () => {
    const harness = createHarness();
    const { client, sockets } = harness;
    const socket = await harness.openFirst();

    const first = client.request("ping", {}, { timeoutMs: 60000 });
    const second = client.request("ping", {}, { timeoutMs: 60000 });
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2));

    client.disconnect("ws_closed");

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toMatchObject({ success: false, message: "ws_closed" });
    expect(secondResult).toMatchObject({ success: false, message: "ws_closed" });
    expect(firstResult.data.requestId).toBe(socket.sent[0].data.requestId);
    expect(secondResult.data.requestId).toBe(socket.sent[1].data.requestId);
  });

  it("ignores stale callbacks from a retired socket", async () => {
    const harness = createHarness();
    const { client } = harness;
    const first = await harness.openFirst();

    client.disconnect("ws_closed");
    expect(client.isConnected()).toBe(false);

    // Late events from the retired socket must not mutate state.
    first.open();
    first.receive({ success: true, message: "ok", data: { requestId: "stale" } });
    first.close();

    expect(client.isConnected()).toBe(false);
    expect(client.getConnectionState().state).toBe("offline");
    expect(harness.commands).toHaveLength(0);
    expect(harness.states.at(-1)).toMatchObject({ connected: false });
  });

  it("guards callbacks already queued from a retired socket against the new generation", async () => {
    const harness = createHarness();
    const { client, sockets, commands, alarms, opens, closes } = harness;
    const first = await harness.openFirst();

    // Capture the handler functions BEFORE replacement: an event callback
    // the runtime already dispatched keeps executing even after the handler
    // properties are cleared on the retired socket.
    const staleOpen = first.onopen;
    const staleMessage = first.onmessage;
    const staleClose = first.onclose;
    const staleError = first.onerror;

    // A new generation exists with its own connected socket and a pending
    // request that must be untouched by the stale callbacks.
    client.disconnect("ws_closed");
    client.connect({ force: true });
    const second = sockets.at(-1);
    second.open();
    expect(client.isConnected()).toBe(true);
    const opensBefore = opens.length;

    const pending = client.request("ping", {}, { timeoutMs: 60000 });
    await vi.waitFor(() => expect(second.sent).toHaveLength(1));
    const requestId = second.sent[0].data.requestId;

    // A late Desktop command from the retired socket must not dispatch into
    // the new generation.
    staleMessage({ data: JSON.stringify({ action: "theme_changed", data: {} }) });
    expect(commands).toHaveLength(0);

    // Late open/close/error must not mutate state, invoke application
    // callbacks, or schedule a duplicate reconnect.
    staleOpen({});
    staleClose({});
    staleError({});

    expect(client.isConnected()).toBe(true);
    expect(opens.length).toBe(opensBefore);
    expect(closes).toHaveLength(0);
    expect(alarms).toHaveLength(0);
    expect(sockets).toHaveLength(2);

    // The new generation's pending request still resolves through the new
    // socket alone.
    second.receive({
      success: true,
      message: "ok",
      data: { requestId, traceId: "trace-new" },
    });
    await expect(pending).resolves.toMatchObject({
      success: true,
      data: { requestId, traceId: "trace-new" },
    });
  });

  it("schedules reconnect with alarm coordination and no duplicate sockets", async () => {
    const harness = createHarness();
    const { client, sockets, alarms } = harness;
    const first = await harness.openFirst();

    first.close();
    await vi.waitFor(() => expect(alarms.length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(sockets.length).toBeGreaterThanOrEqual(2));
    expect(client.isConnected()).toBe(false);

    // Give the reconnect timer plenty of room: still only one fresh socket.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sockets).toHaveLength(2);
  });

  it("reconnects after a normal close and retries connection attempts", async () => {
    const harness = createHarness();
    const { client, sockets } = harness;
    const first = await harness.openFirst();

    first.close();
    await vi.waitFor(() => expect(sockets.length).toBeGreaterThanOrEqual(2));
    const second = sockets[1];
    second.open();
    await vi.waitFor(() => expect(client.isConnected()).toBe(true));
  });
});

describe("desktop protocol client request correlation", () => {
  it("matches an acknowledgement by requestId and expected shape", async () => {
    const harness = createHarness();
    const { client, sockets } = harness;
    const socket = await harness.openFirst();

    const promise = client.request("video_selected_v2", { url: "https://x.com/1" });
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    const requestId = socket.sent[0].data.requestId;

    socket.receive({ success: true, message: "ok", data: { requestId, traceId: "trace-1" } });

    await expect(promise).resolves.toMatchObject({
      success: true,
      data: { requestId, traceId: "trace-1" },
    });
  });

  it("accepts the snake_case request_id alias", async () => {
    const harness = createHarness();
    const { client, sockets } = harness;
    const socket = await harness.openFirst();

    const promise = client.request("ping", {});
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    const requestId = socket.sent[0].data.requestId;

    socket.receive({ success: true, message: "ok", data: { request_id: requestId } });
    await expect(promise).resolves.toMatchObject({ success: true });
  });

  it("handles duplicates and unknown responses without resolving twice or dispatching", async () => {
    const harness = createHarness();
    const { client, sockets } = harness;
    const socket = await harness.openFirst();

    const promise = client.request("ping", {}, { timeoutMs: 60000 });
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    const requestId = socket.sent[0].data.requestId;

    const first = { success: true, message: "ok", data: { requestId } };
    const duplicate = { success: true, message: "ok", data: { requestId } };
    socket.receive(first);
    socket.receive(duplicate);
    socket.receive({ success: true, message: "ok", data: { requestId: "unknown-req" } });

    await expect(promise).resolves.toMatchObject({ success: true });
    expect(harness.commands).toHaveLength(0);
  });

  it("rejects wrong-kind responses that carry a matching requestId", async () => {
    const harness = createHarness();
    const { client, sockets } = harness;
    const socket = await harness.openFirst();

    const promise = client.request(
      "save_data_url",
      { dataUrl: "data:image/png;base64,AAAA" },
      { timeoutMs: 60000, expectedKind: "save_data_url" },
    );
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    const requestId = socket.sent[0].data.requestId;

    socket.receive({
      success: true,
      message: "ok",
      action: "something_else",
      data: { requestId },
    });

    await expect(promise).resolves.toMatchObject({
      success: false,
      message: "unexpected_response",
    });
  });

  it("times out a request that Desktop never answers", async () => {
    const harness = createHarness();
    const { client, sockets } = harness;
    const socket = await harness.openFirst();

    const promise = client.request("ping", {}, { timeoutMs: 30 });
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    const requestId = socket.sent[0].data.requestId;

    await expect(promise).resolves.toMatchObject({
      success: false,
      message: "request_timeout",
      data: { requestId },
    });
  });

  it("classifies malformed JSON and non-object payloads without mutation", async () => {
    const harness = createHarness();
    const { client, sockets, commands } = harness;
    const socket = await harness.openFirst();

    socket.receiveRaw("{not json");
    socket.receiveRaw("42");
    socket.receiveRaw("null");
    socket.receive({ action: "theme_changed", data: { theme: "white" } });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ action: "theme_changed" });
    expect(client.isConnected()).toBe(true);
  });

  it("dispatches Desktop-initiated commands with requestId correlation intact", async () => {
    const harness = createHarness();
    const { client, sockets, commands } = harness;
    const socket = await harness.openFirst();

    socket.receive({
      action: "resolve_pasted_video_selection",
      data: { requestId: "pasted-video-selection-1", url: "https://x.com/v" },
    });

    expect(commands).toHaveLength(1);
    expect(commands[0].data.requestId).toBe("pasted-video-selection-1");
  });

  it("rejects pendings with not_connected when no connection can be made", async () => {
    const harness = createHarness();
    const { client } = harness;

    await expect(client.request("ping", {}, { connectTimeoutMs: 5 })).resolves.toEqual({
      success: false,
      message: "not_connected",
      data: { code: "not_connected" },
    });
  });

  it("sends notifications only when connected", async () => {
    const harness = createHarness();
    const { client, sockets } = harness;

    expect(client.sendNotification("get_theme", {})).toBe(false);
    const socket = await harness.openFirst();
    expect(client.sendNotification("get_theme", {})).toBe(true);
    expect(socket.sent).toEqual([{ action: "get_theme", data: {} }]);
  });

  it("does not retry after an ambiguous post-send failure", async () => {
    const harness = createHarness();
    const { client, sockets } = harness;
    const socket = await harness.openFirst();

    const promise = client.request(
      "video_selected_v2",
      { url: "https://x.com/1" },
      { timeoutMs: 30 },
    );
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));

    const result = await promise;
    expect(result).toMatchObject({ success: false, message: "request_timeout" });
    // The command was sent exactly once; no automatic retry.
    expect(socket.sent.filter((sent) => sent.action === "video_selected_v2")).toHaveLength(1);
  });

  it("resetSocketForRetry retires a generation without rescheduling reconnect", async () => {
    const harness = createHarness();
    const { client, sockets, alarms } = harness;
    await harness.openFirst();

    client.resetSocketForRetry();
    expect(client.isConnected()).toBe(false);
    expect(alarms).toHaveLength(0);

    const next = client.connect({ force: true });
    expect(next.connecting).toBe(true);
    expect(sockets).toHaveLength(2);
  });
});
