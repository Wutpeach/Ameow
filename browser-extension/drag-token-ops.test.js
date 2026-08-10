import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// Behavior tests for the drag-token lifecycle: page-context store and token
// registries are the real modules, wired together through the ops module
// with a fake tab lookup — the same composition background.js uses.

const loadWorld = () => {
  const context = { self: {}, globalThis: {}, Map, Date, URL, Promise };
  for (const file of ["page-context.js", "drag-token-registry.js", "drag-token-ops.js"]) {
    const source = readFileSync(path.resolve(`browser-extension/${file}`), "utf8");
    vm.runInNewContext(source, context, { filename: file });
  }
  return context.self;
};

const createHarness = () => {
  const root = loadWorld();
  const pageContextStore = root.AmeowPageContext.createPageContextStore();
  const registry = root.AmeowDragTokenRegistry.createDragTokenRegistry({
    ttlMs: 60000,
    totalLimit: 10,
    now: () => 1000,
  });
  const tabs = new Map();

  const ops = root.AmeowDragTokenOps.createDragTokenOps({
    pageContextStore,
    getTab: async (tabId) => tabs.get(tabId) ?? null,
    normalizeHttpUrl: (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  });

  return { pageContextStore, registry, ops, tabs };
};

const register = (ops, registry, token, { tabId = 1, pageUrl = "https://a.com/page" } = {}) => {
  const registration = ops.buildRegistration({ tabId, frameId: 0, pageUrl }, { pageUrl });
  expect(registration.success).toBe(true);
  return registry.register(token, registration.facts);
};

describe("drag token page-context lifecycle", () => {
  it("binds registrations to the page context key and navigation generation", () => {
    const harness = createHarness();
    const { pageContextStore, ops, registry } = harness;

    pageContextStore.advanceNavigation(1);
    const registration = ops.buildRegistration(
      { tabId: 1, frameId: 0, pageUrl: "https://a.com/page" },
      { pageUrl: "https://a.com/page" },
    );
    expect(registration.facts.pageContextKey).toContain("https://a.com/page#1");
    expect(registration.facts.navigationGeneration).toBe(1);
    expect(registry.register("t", registration.facts)).toMatchObject({ success: true });
  });

  it("revalidates an unchanged page and rejects after a same-URL reload", async () => {
    const harness = createHarness();
    const { pageContextStore, ops, registry, tabs } = harness;
    tabs.set(1, { id: 1, url: "https://a.com/page" });

    register(ops, registry, "token-1");
    const consumed = registry.consume("token-1");
    expect(consumed.success).toBe(true);
    expect(await ops.revalidateEntry(consumed.entry)).toBe(true);

    // Same-URL reload: the loading event advances the navigation generation
    // while the tab URL stays identical.
    register(ops, registry, "token-2");
    pageContextStore.advanceNavigation(1);
    const consumedAfterReload = registry.consume("token-2");
    expect(consumedAfterReload.success).toBe(true);
    expect(await ops.revalidateEntry(consumedAfterReload.entry)).toBe(false);
  });

  it("rejects when the tab navigated to a different URL", async () => {
    const harness = createHarness();
    const { pageContextStore, ops, registry, tabs } = harness;

    register(ops, registry, "token-1");
    tabs.set(1, { id: 1, url: "https://other.com/page" });
    pageContextStore.advanceNavigation(1);

    const consumed = registry.consume("token-1");
    expect(await ops.revalidateEntry(consumed.entry)).toBe(false);
  });

  it("rejects when the registered tab is gone", async () => {
    const harness = createHarness();
    const { ops, registry } = harness;

    register(ops, registry, "token-1");
    const consumed = registry.consume("token-1");
    expect(await ops.revalidateEntry(consumed.entry)).toBe(false);
  });

  it("rejects when tab lookup fails", async () => {
    const harness = createHarness();
    const { ops, registry, tabs } = harness;

    register(ops, registry, "token-1");
    tabs.set(1, { id: 1, url: "https://a.com/page" });
    tabs.delete(1);

    const consumed = registry.consume("token-1");
    expect(await ops.revalidateEntry(consumed.entry)).toBe(false);
  });

  it("removes only the removed tab's tokens, leaving other tabs untouched", () => {
    const harness = createHarness();
    const { pageContextStore, registry, ops } = harness;

    pageContextStore.advanceNavigation(1);
    pageContextStore.advanceNavigation(2);
    register(ops, registry, "tab-a-token", { tabId: 1, pageUrl: "https://a.com/x" });
    register(ops, registry, "tab-b-token", { tabId: 2, pageUrl: "https://b.com/x" });

    expect(registry.removeByTab(1)).toBe(1);
    expect(registry.has("tab-a-token")).toBe(false);
    expect(registry.has("tab-b-token")).toBe(true);
  });
});
