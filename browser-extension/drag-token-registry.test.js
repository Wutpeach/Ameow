import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/drag-token-registry.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadRegistry = (overrides = {}) => {
  const context = {
    self: {},
    globalThis: {},
    Map,
    Date,
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowDragTokenRegistry.createDragTokenRegistry({
    ttlMs: 1000,
    totalLimit: 3,
    now: () => currentTime,
    ...overrides,
  });
};

let currentTime = 0;

const facts = {
  tabId: 7,
  frameId: 0,
  documentId: "doc-1",
  pageContextKey: "7:0:https://a.com/x",
  imageUrl: "https://a.com/img.jpg",
  pageUrl: "https://a.com/x",
};

describe("drag token registry", () => {
  it("registers and consumes a token exactly once", () => {
    currentTime = 1000;
    const registry = loadRegistry();

    expect(registry.register("token-1", facts)).toMatchObject({ success: true });
    expect(registry.has("token-1")).toBe(true);

    const consumed = registry.consume("token-1");
    expect(consumed.success).toBe(true);
    expect(consumed.entry.pageContextKey).toBe("7:0:https://a.com/x");

    // One-shot: a duplicate command cannot consume it again.
    const again = registry.consume("token-1");
    expect(again).toMatchObject({ success: false, code: "drag_token_missing" });
  });

  it("reports workerRestarted on a miss in a registry that never saw a token", () => {
    currentTime = 1000;
    const registry = loadRegistry();

    const consumed = registry.consume("ghost-token");
    expect(consumed).toMatchObject({
      success: false,
      code: "drag_token_missing",
      workerRestarted: true,
    });
  });

  it("does not report workerRestarted after other registrations existed", () => {
    currentTime = 1000;
    const registry = loadRegistry();
    registry.register("token-1", facts);
    registry.consume("token-1");

    const consumed = registry.consume("other-token");
    expect(consumed).toMatchObject({
      success: false,
      code: "drag_token_missing",
      workerRestarted: false,
    });
  });

  it("enforces the TTL and prunes expired tokens", () => {
    currentTime = 1000;
    const registry = loadRegistry();
    registry.register("token-1", facts);

    currentTime = 2500;
    expect(registry.has("token-1")).toBe(false);
    expect(registry.consume("token-1")).toMatchObject({ success: false });
  });

  it("enforces the total limit and rejects over-limit registrations", () => {
    currentTime = 1000;
    const registry = loadRegistry();
    registry.register("a", facts);
    currentTime = 1100;
    registry.register("b", facts);
    currentTime = 1200;
    registry.register("c", facts);

    expect(registry.register("d", facts)).toMatchObject({
      success: false,
      code: "drag_token_limit_reached",
    });

    // The existing registrations survive the rejected one.
    expect(registry.has("a")).toBe(true);
    expect(registry.has("b")).toBe(true);
    expect(registry.has("c")).toBe(true);
    expect(registry.has("d")).toBe(false);

    // Expiring the oldest frees a slot.
    currentTime = 2500;
    expect(registry.register("d", facts)).toMatchObject({ success: true });
  });

  it("keeps authority fields immutable against a mismatched page context", () => {
    currentTime = 1000;
    const registry = loadRegistry();
    registry.register("token-1", facts);

    // A later Desktop payload cannot replace the registered page context.
    const consumed = registry.consume("token-1", "7:0:https://other.com/y");
    expect(consumed).toMatchObject({
      success: false,
      code: "drag_token_page_context_mismatch",
    });
    // The token was still consumed atomically.
    expect(registry.has("token-1")).toBe(false);
  });

  it("removes all tokens bound to an invalidated page context", () => {
    currentTime = 1000;
    const registry = loadRegistry();
    registry.register("token-1", facts);
    registry.register("token-2", { ...facts, pageContextKey: "7:0:https://other.com/y" });

    expect(registry.removeByPageContext("7:0:https://a.com/x")).toBe(1);
    expect(registry.has("token-1")).toBe(false);
    expect(registry.has("token-2")).toBe(true);
  });

  it("rejects duplicate registrations and invalid tokens", () => {
    currentTime = 1000;
    const registry = loadRegistry();

    expect(registry.register("token-1", facts)).toMatchObject({ success: true });
    expect(registry.register("token-1", facts)).toMatchObject({
      success: false,
      code: "drag_token_already_registered",
    });
    expect(registry.register("", facts)).toMatchObject({
      success: false,
      code: "drag_token_invalid",
    });
    expect(registry.register("token-2", null)).toMatchObject({
      success: false,
      code: "drag_token_invalid",
    });
  });
});
