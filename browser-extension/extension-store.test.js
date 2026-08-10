import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/extension-store.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadStore = (backing) => {
  const context = {
    self: {},
    globalThis: {},
    Map,
    Promise,
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.AmeowExtensionStore.createSerializedStorageStore({
    async storageGet(key) {
      return { [key]: backing.get(key) };
    },
    async storageSet(payload) {
      for (const [key, value] of Object.entries(payload)) {
        backing.set(key, value);
      }
    },
  });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("serialized storage store", () => {
  it("serializes concurrent updates to the same key without lost writes", async () => {
    const backing = new Map([["counters", { video: 0, image: 0 }]]);
    const store = loadStore(backing);

    await Promise.all([
      store.update("counters", (current) => ({
        ...(current || {}),
        video: (current?.video || 0) + 1,
      })),
      store.update("counters", (current) => ({
        ...(current || {}),
        image: (current?.image || 0) + 1,
      })),
    ]);

    expect(backing.get("counters")).toEqual({ video: 1, image: 1 });
  });

  it("serializes read-modify-write sequences per key", async () => {
    const backing = new Map([["queue", []]]);
    const store = loadStore(backing);

    await Promise.all(
      Array.from({ length: 10 }, (_, index) => (
        store.update("queue", (current) => [...(current || []), index])
      )),
    );

    expect(backing.get("queue")).toHaveLength(10);
    expect([...backing.get("queue")].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("allows concurrent updates to different keys to proceed independently", async () => {
    const backing = new Map([["a", 0], ["b", 0]]);
    const store = loadStore(backing);

    await Promise.all([
      store.update("a", (current) => (current || 0) + 1),
      store.update("b", (current) => (current || 0) + 1),
    ]);

    expect(backing.get("a")).toBe(1);
    expect(backing.get("b")).toBe(1);
  });

  it("keeps the previous value when the reducer returns undefined", async () => {
    const backing = new Map([["key", { keep: true }]]);
    const store = loadStore(backing);

    await store.update("key", () => undefined);
    expect(backing.get("key")).toEqual({ keep: true });
  });

  it("survives a failing write without corrupting later updates", async () => {
    const backing = new Map();
    let failing = true;
    const context = {
      self: {},
      globalThis: {},
      Map,
      Promise,
    };
    vm.runInNewContext(helperSource, context, { filename: helperPath });
    const store = context.self.AmeowExtensionStore.createSerializedStorageStore({
      async storageGet(key) {
        return { [key]: backing.get(key) };
      },
      async storageSet(payload) {
        if (failing) {
          throw new Error("storage busy");
        }
        for (const [key, value] of Object.entries(payload)) {
          backing.set(key, value);
        }
      },
    });

    const first = await store.update("key", () => ({ v: 1 }));
    expect(first).toBeNull();
    failing = false;
    await store.update("key", (current) => ({ v: 2 }));
    expect(backing.get("key")).toEqual({ v: 2 });
    await sleep(10);
  });
});
