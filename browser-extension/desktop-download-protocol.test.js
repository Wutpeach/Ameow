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
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowDesktopDownloadProtocol;
};

const createClient = (overrides = {}) => {
  const protocol = loadProtocol();
  const sent = [];
  const client = protocol.createDesktopDownloadRequestClient({
    isConnected: () => true,
    ensureConnection: async () => true,
    send(payload) {
      sent.push(payload);
      if (overrides.sendThrows) {
        throw new Error("socket closed");
      }
    },
    ...overrides,
  });
  return { protocol, client, sent };
};

const resolvePendingResponse = (client, data) => client.handlePendingResponse({
  success: true,
  message: "ok",
  data,
});

describe("desktop download protocol client", () => {
  it("correlates a request with the desktop acknowledgement by requestId", async () => {
    const { client, sent } = createClient();

    const promise = client.sendRequest("video_selected_v2", { url: "https://x.com/1" }, 7000);

    expect(sent).toHaveLength(1);
    const payload = sent[0];
    expect(payload.action).toBe("video_selected_v2");
    expect(payload.data.url).toBe("https://x.com/1");
    expect(typeof payload.data.requestId).toBe("string");

    const requestId = payload.data.requestId;
    const resolved = resolvePendingResponse(client, { requestId, traceId: "trace-1" });
    expect(resolved).toBe(true);
    await expect(promise).resolves.toMatchObject({
      success: true,
      data: { requestId, traceId: "trace-1" },
    });
  });

  it("resolves responses carrying the snake_case request_id alias", async () => {
    const { client, sent } = createClient();

    const promise = client.sendRequest("ping", {}, 7000);
    const requestId = sent[0].data.requestId;

    const resolved = resolvePendingResponse(client, { request_id: requestId });
    expect(resolved).toBe(true);
    await expect(promise).resolves.toMatchObject({ success: true });
  });

  it("returns request_timeout when the desktop never answers", async () => {
    const { client, sent } = createClient();

    const result = await client.sendRequest("ping", {}, 20);

    expect(result).toEqual({
      success: false,
      message: "request_timeout",
      data: { code: "request_timeout", requestId: sent[0].data.requestId },
    });
  });

  it("does not consume responses for unknown correlations", () => {
    const { client } = createClient();

    expect(resolvePendingResponse(client, { requestId: "unknown-req" })).toBe(false);
  });

  it("returns not_connected when the socket is down", async () => {
    const { client } = createClient({
      isConnected: () => false,
      ensureConnection: async () => false,
    });

    await expect(client.sendRequest("ping", {}, 7000)).resolves.toEqual({
      success: false,
      message: "not_connected",
      data: { code: "not_connected" },
    });
  });

  it("returns send_failed when the socket throws", async () => {
    const { client, sent } = createClient({ sendThrows: true });

    const result = await client.sendRequest("ping", {}, 7000);

    expect(result.success).toBe(false);
    expect(result.data.code).toBe("send_failed");
    expect(result.data.requestId).toBe(sent[0].data.requestId);
  });

  it("rejects all pending requests with the given reason", async () => {
    const { client, sent } = createClient();

    const first = client.sendRequest("ping", {}, 7000);
    const second = client.sendRequest("ping", {}, 7000);
    expect(sent).toHaveLength(2);

    client.rejectPending("ws_closed");

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toMatchObject({ success: false, message: "ws_closed" });
    expect(secondResult).toMatchObject({ success: false, message: "ws_closed" });
    expect(firstResult.data.requestId).toBe(sent[0].data.requestId);
    expect(secondResult.data.requestId).toBe(sent[1].data.requestId);
  });

  it("reconnects before sending when disconnected", async () => {
    let connected = false;
    const { client, sent } = createClient({
      isConnected: () => connected,
      ensureConnection: async () => {
        connected = true;
        return true;
      },
    });

    const promise = client.sendRequest(
      "get_language",
      {},
      7000,
      { connectTimeoutMs: 300, forceConnect: true },
    );

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    resolvePendingResponse(client, { requestId: sent[0].data.requestId });
    await expect(promise).resolves.toMatchObject({ success: true });
  });

  it("builds failed acknowledgements with optional request ids", () => {
    const protocol = loadProtocol();

    expect(protocol.buildRequestFailure("not_connected")).toEqual({
      success: false,
      message: "not_connected",
      data: { code: "not_connected" },
    });
    expect(protocol.buildRequestFailure("timeout", "req-1")).toEqual({
      success: false,
      message: "timeout",
      data: { code: "timeout", requestId: "req-1" },
    });
  });
});
