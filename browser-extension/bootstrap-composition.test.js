import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// Bootstrap composition test: actually evaluates background.js end-to-end in
// a VM with fake chrome, real importScripts loading (each imported module is
// evaluated into the same context), and a fake WebSocket. Proves there is no
// initialization-order ReferenceError (e.g. a const captured before its
// declaration in the composition root) and that the startup tail
// (language init, download-state rehydration, connect) runs without
// rejecting. A source-order assertion alone would not catch a TDZ that only
// fires when the worker evaluates.

const extensionDir = import.meta.dirname;
const read = (name) => readFileSync(path.join(extensionDir, name), "utf8");

// The protocol client attaches plain onopen/onmessage/onclose/onerror
// properties and never opens in the test, so the fake needs no behavior.
class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }

  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;

const createFakeChrome = () => {
  const runtimeListeners = [];
  const storageListeners = [];
  return {
    runtimeListeners,
    storageListeners,
    chrome: {
      runtime: {
        lastError: undefined,
        sendMessage: () => Promise.resolve({}),
        onMessage: { addListener: (listener) => runtimeListeners.push(listener) },
        onStartup: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
      },
      alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: { addListener: () => {} },
      },
      tabs: {
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: () => {} },
        query: async () => [],
      },
      storage: {
        local: {
          get: (keys, callback) => callback({}),
          set: (payload, callback) => callback(),
        },
        onChanged: { addListener: (listener) => storageListeners.push(listener) },
      },
      downloads: { onChanged: { addListener: () => {} } },
      webRequest: { onHeadersReceived: { addListener: () => {} } },
      action: {
        setBadgeText: async () => {},
        setIcon: async () => {},
        setTitle: async () => {},
      },
      windows: { getAll: async () => [] },
      i18n: { getMessage: () => "" },
    },
  };
};

describe("background.js bootstrap composition", () => {
  it("evaluates the real service worker without an initialization-order ReferenceError", async () => {
    const { runtimeListeners, chrome } = createFakeChrome();
    const sockets = [];

    // The injected socket factory constructs real FakeWebSocket instances,
    // so the recorder only sees the connection made by the startup tail.
    const RecordingWebSocket = class extends FakeWebSocket {
      constructor(url) {
        super(url);
        sockets.push(this);
      }
    };

    let contextified;
    const sandbox = {
      // Module files register under `self` (the worker global), so the
      // importScripts evaluation and background.js must share one context.
      self: {},
      globalThis: {},
      console,
      Date,
      Map,
      Set,
      Promise,
      URL,
      RegExp,
      JSON,
      Math,
      Number,
      String,
      Boolean,
      Array,
      Object,
      Error,
      TypeError,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      parseInt,
      parseFloat,
      encodeURIComponent,
      decodeURIComponent,
      isNaN,
      navigator: { language: "en-US" },
      chrome,
      WebSocket: RecordingWebSocket,
      importScripts: (...files) => {
        for (const file of files) {
          vm.runInContext(read(file), contextified, { filename: file });
        }
      },
    };
    contextified = vm.createContext(sandbox);

    const unhandled = [];
    const onRejection = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", onRejection);
    try {
      // A TDZ defect (ops constructed before the const they capture) throws
      // here during evaluation.
      vm.runInContext(read("background.js"), contextified, { filename: "background.js" });
      // Let the startup tail's promise chain settle (language init, state
      // rehydration, connect) before asserting nothing rejected.
      await new Promise((resolve) => setTimeout(resolve, 25));
    } finally {
      process.removeListener("unhandledRejection", onRejection);
    }

    // importScripts landed every module on the worker global.
    for (const name of [
      "AmeowDesktopDownloadProtocol",
      "AmeowDesktopPort",
      "AmeowPageContext",
      "AmeowSiteSessionOps",
      "AmeowSelectionOps",
      "AmeowMediaScanOps",
      "AmeowDragTokenOps",
    ]) {
      expect(sandbox.self[name], `${name} must be defined by importScripts`).toBeTruthy();
    }

    // The composition root registered exactly one runtime message router.
    expect(runtimeListeners).toHaveLength(1);
    // The startup tail ran: connect() opened a socket.
    expect(sockets.length).toBeGreaterThanOrEqual(1);
    // No startup promise rejected (language init, rehydration, connect).
    expect(unhandled).toEqual([]);
  });
});
