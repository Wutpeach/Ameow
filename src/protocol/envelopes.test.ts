import { describe, expect, it } from "vitest";
import {
  decodeIpcRequestEnvelope,
  decodeWsRootEnvelope,
} from "./envelopes.js";

const WS_INVALID = { success: false, message: "Invalid request", data: null };

describe("decodeIpcRequestEnvelope", () => {
  it("preserves the command and payload of a valid envelope", () => {
    expect(decodeIpcRequestEnvelope({ command: "queue_video_download", payload: { url: "https://x.com/" } }))
      .toEqual({ command: "queue_video_download", payload: { url: "https://x.com/" } });
    expect(decodeIpcRequestEnvelope({ command: "ping" })).toEqual({ command: "ping", payload: undefined });
  });

  it("rejects null and non-object roots", () => {
    for (const request of [null, undefined, "hello", 42, true]) {
      expect(() => decodeIpcRequestEnvelope(request)).toThrow("Invalid IPC request envelope");
    }
  });

  it("rejects array roots", () => {
    expect(() => decodeIpcRequestEnvelope(["ping"])).toThrow("Invalid IPC request envelope");
  });

  it("rejects missing and non-string commands", () => {
    expect(() => decodeIpcRequestEnvelope({})).toThrow("Invalid IPC request envelope");
    expect(() => decodeIpcRequestEnvelope({ payload: {} })).toThrow("Invalid IPC request envelope");
    expect(() => decodeIpcRequestEnvelope({ command: 42 })).toThrow("Invalid IPC request envelope");
    expect(() => decodeIpcRequestEnvelope({ command: null })).toThrow("Invalid IPC request envelope");
  });

  it("rejects blank and whitespace-only commands", () => {
    expect(() => decodeIpcRequestEnvelope({ command: "" })).toThrow("Invalid IPC request envelope");
    expect(() => decodeIpcRequestEnvelope({ command: "   " })).toThrow("Invalid IPC request envelope");
    expect(() => decodeIpcRequestEnvelope({ command: "\t\n" })).toThrow("Invalid IPC request envelope");
  });
});

describe("decodeWsRootEnvelope", () => {
  it("preserves the action, data and camelCase request id of a valid envelope", () => {
    expect(decodeWsRootEnvelope({
      action: "video_selected_v2",
      data: { url: "https://x.com/", requestId: "req-1" },
    })).toEqual({
      ok: true,
      action: "video_selected_v2",
      data: { url: "https://x.com/", requestId: "req-1" },
      requestId: "req-1",
    });
  });

  it("defaults missing data to null and extracts the snake_case request id", () => {
    expect(decodeWsRootEnvelope({
      action: "sync_download_preferences",
      data: { request_id: "snake-req" },
    })).toEqual({
      ok: true,
      action: "sync_download_preferences",
      data: { request_id: "snake-req" },
      requestId: "snake-req",
    });
    expect(decodeWsRootEnvelope({ action: "ping" })).toEqual({
      ok: true,
      action: "ping",
      data: null,
      requestId: null,
    });
  });

  it("returns the malformed-WS failure envelope for null and non-object roots", () => {
    for (const parsed of [null, undefined, "hello", 42]) {
      expect(decodeWsRootEnvelope(parsed)).toEqual({ ok: false, failure: WS_INVALID });
    }
  });

  it("returns the failure envelope for array roots", () => {
    expect(decodeWsRootEnvelope([{ action: "ping" }])).toEqual({ ok: false, failure: WS_INVALID });
  });

  it("returns the failure envelope for missing and non-string actions", () => {
    for (const parsed of [{}, { data: {} }, { action: 42 }, { action: null }, { action: ["ping"] }]) {
      expect(decodeWsRootEnvelope(parsed)).toEqual({ ok: false, failure: WS_INVALID });
    }
  });

  it("returns the failure envelope for blank and whitespace-only actions", () => {
    expect(decodeWsRootEnvelope({ action: "" })).toEqual({ ok: false, failure: WS_INVALID });
    expect(decodeWsRootEnvelope({ action: "   " })).toEqual({ ok: false, failure: WS_INVALID });
  });

  it("passes unknown non-blank actions through for downstream unknown_action handling", () => {
    expect(decodeWsRootEnvelope({ action: "mystery_action", data: null })).toEqual({
      ok: true,
      action: "mystery_action",
      data: null,
      requestId: null,
    });
  });
});
