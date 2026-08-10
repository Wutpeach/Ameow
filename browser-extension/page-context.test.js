import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/page-context.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadStore = () => {
  const context = {
    self: {},
    globalThis: {},
    Map,
    URL,
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowPageContext.createPageContextStore();
};

describe("page context store", () => {
  it("normalizes a content-originated sender once into tab/frame/document identity", () => {
    const store = loadStore();

    const context = store.normalizeBrowserMessageContext({
      tab: { id: 7, url: "https://example.com/a?q=1" },
      frameId: 3,
      documentId: "doc-abc",
      url: "https://example.com/frame",
    });

    expect(context).toEqual({
      tabId: 7,
      frameId: 3,
      documentId: "doc-abc",
      pageUrl: "https://example.com/a?q=1",
    });
  });

  it("keeps frame-originated identity distinct from the main frame", () => {
    const store = loadStore();
    store.advanceNavigation(1);

    const mainFrame = store.pageContextKey({ tabId: 1, frameId: 0, pageUrl: "https://a.com/x" });
    const iframe = store.pageContextKey({ tabId: 1, frameId: 5, pageUrl: "https://a.com/x" });

    expect(mainFrame).not.toBe(iframe);
    expect(mainFrame).toContain(":0:");
    expect(iframe).toContain(":5:");
  });

  it("prefers documentId when Chrome supplies it", () => {
    const store = loadStore();

    const withDoc = store.pageContextKey({
      tabId: 1,
      frameId: 0,
      documentId: "doc-xyz",
      pageUrl: "https://a.com/x",
    });
    const sameDocAgain = store.pageContextKey({
      tabId: 1,
      frameId: 0,
      documentId: "doc-xyz",
      pageUrl: "https://a.com/changed",
    });
    const otherDoc = store.pageContextKey({
      tabId: 1,
      frameId: 0,
      documentId: "doc-new",
      pageUrl: "https://a.com/x",
    });

    expect(withDoc).toBe("1:0:doc:doc-xyz");
    expect(sameDocAgain).toBe(withDoc);
    expect(otherDoc).not.toBe(withDoc);
  });

  it("advances the fallback key on navigation and document replacement", () => {
    const store = loadStore();

    const before = store.pageContextKey({ tabId: 2, frameId: 0, pageUrl: "https://a.com/x" });
    store.advanceNavigation(2);
    const after = store.pageContextKey({ tabId: 2, frameId: 0, pageUrl: "https://a.com/x" });
    store.advanceNavigation(2);
    const afterAgain = store.pageContextKey({ tabId: 2, frameId: 0, pageUrl: "https://a.com/x" });

    expect(before).not.toBe(after);
    expect(after).not.toBe(afterAgain);
  });

  it("isolates navigation generations per tab", () => {
    const store = loadStore();

    store.advanceNavigation(2);
    const keyA = store.pageContextKey({ tabId: 2, frameId: 0, pageUrl: "https://a.com/x" });
    const keyB = store.pageContextKey({ tabId: 9, frameId: 0, pageUrl: "https://a.com/x" });

    expect(keyA).not.toBe(keyB);
  });

  it("removes all page-scoped state on tab removal", () => {
    const store = loadStore();

    store.advanceNavigation(2);
    store.advanceNavigation(2);
    store.removeTab(2);

    expect(store.getNavigationGeneration(2)).toBe(0);
    // A new navigation on the reused tab id starts from generation 1.
    const key = store.pageContextKey({ tabId: 2, frameId: 0, pageUrl: "https://a.com/x" });
    expect(key).toContain("#0");
  });

  it("returns a stable key for the active main frame of a tab", () => {
    const store = loadStore();

    const key = store.pageContextKey({ tabId: 5, frameId: 0, pageUrl: "https://a.com/video" });
    expect(key).toBe("5:0:https://a.com/video#0");
  });

  it("rejects keys without a tab id", () => {
    const store = loadStore();
    expect(store.pageContextKey({ frameId: 0, pageUrl: "https://a.com/x" })).toBeNull();
  });
});
