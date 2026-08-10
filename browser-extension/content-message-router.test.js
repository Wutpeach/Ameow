import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/content-message-router.js");
const helperSource = readFileSync(helperPath, "utf8");

// Loads the router singleton into a fresh window and returns its public
// surface; registrations accumulate per loaded instance.
const loadRouter = () => {
  const listeners = [];
  const window = {
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          },
          removeListener() {},
        },
      },
    },
    console,
  };
  const context = {
    window,
    self: {},
    globalThis: {},
    Promise,
    console,
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return {
    router: window.AmeowContentMessageRouter,
    listeners,
    async handle(message, sender = {}) {
      let response = null;
      const handled = window.AmeowContentMessageRouter.handleMessage(
        message,
        sender,
        (payload) => {
          response = payload;
        },
      );
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
      }
      return { handled, response };
    },
  };
};

describe("content message router", () => {
  it("registers exactly one listener per frame", () => {
    const { listeners } = loadRouter();
    expect(listeners).toHaveLength(1);
  });

  it("answers a message through the site-specific resolver first", async () => {
    const { router, handle } = loadRouter();

    router.registerResolver("resolve", () => ({ success: true, source: "site" }), 0);
    router.registerResolver("resolve", () => ({ success: true, source: "generic" }), 1);

    const { handled, response } = await handle({ type: "resolve" });
    expect(handled).toBe(true);
    expect(response).toEqual({ success: true, source: "site" });
  });

  it("falls back to the generic resolver when the site resolver skips", async () => {
    const { router, handle } = loadRouter();

    router.registerResolver("resolve", () => null, 0);
    router.registerResolver("resolve", () => ({ success: true, source: "generic" }), 1);

    const { handled, response } = await handle({ type: "resolve" });
    expect(handled).toBe(true);
    expect(response).toEqual({ success: true, source: "generic" });
  });

  it("supports asynchronous resolvers and answers exactly once", async () => {
    const { router, handle } = loadRouter();
    let siteCalls = 0;

    router.registerResolver("resolve", async () => {
      siteCalls += 1;
      await Promise.resolve();
      return { success: true, source: "site-async" };
    }, 0);
    router.registerResolver("resolve", () => ({ success: true, source: "generic" }), 1);

    const { handled, response } = await handle({ type: "resolve" });
    expect(handled).toBe(true);
    expect(response).toEqual({ success: true, source: "site-async" });
    expect(siteCalls).toBe(1);
  });

  it("returns false for unknown messages without leaving a port open", async () => {
    const { handle } = loadRouter();

    const { handled, response } = await handle({ type: "something_else" });
    expect(handled).toBe(false);
    expect(response).toBeNull();
  });

  it("closes the channel with a stable failure when no resolver answers", async () => {
    const { router, handle } = loadRouter();

    router.registerResolver("resolve", () => null, 0);

    const { handled, response } = await handle({ type: "resolve" });
    expect(handled).toBe(true);
    expect(response).toEqual({ success: false, reason: "resolve_unavailable" });
  });

  it("does not let a duplicate competing listener answer the same message", async () => {
    const { router, handle } = loadRouter();

    router.registerResolver("resolve", () => ({ success: true, source: "first" }), 0);
    router.registerResolver("resolve", () => ({ success: true, source: "second" }), 0);

    const { response } = await handle({ type: "resolve" });
    // Priority order is stable registration order for equal priorities.
    expect(response).toEqual({ success: true, source: "first" });
  });

  it("recovers from a throwing resolver and keeps the generic fallback", async () => {
    const { router, handle } = loadRouter();

    router.registerResolver("resolve", () => {
      throw new Error("boom");
    }, 0);
    router.registerResolver("resolve", () => ({ success: true, source: "generic" }), 1);

    const { handled, response } = await handle({ type: "resolve" });
    expect(handled).toBe(true);
    expect(response).toEqual({ success: true, source: "generic" });
  });
});
