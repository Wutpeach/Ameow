import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P5 Browser Extension architecture guard.
 *
 * Locks the real dependency direction after the P5 ownership moves:
 *
 * 1. Raw Desktop transport mechanics (loopback WebSocket, pending
 *    correlation, ack envelope) live only in the Desktop protocol client.
 *    Background is the composition root and may construct the injected
 *    socket factory, but never touches the wire or the pending map.
 * 2. The Desktop client and the named Desktop port are runtime-neutral:
 *    no chrome.*, DOM, or site-specific code.
 * 3. Outbound Desktop action strings stop at the port boundary.
 * 4. UI and content/site adapters never reference the Desktop transport.
 * 5. Content resolution has one router owner; detectors register resolvers
 *    instead of owning competing onMessage listeners.
 * 6. Manifest wiring loads the content router before the generic detector.
 *
 * This is a static source-scan test because the extension is a set of
 * classic script files composed by importScripts; there is no import graph
 * to analyze. Rules are kept broad so they cannot be satisfied by renaming
 * a helper; representative violation fixtures prove each guard fires.
 */

const extensionDir = import.meta.dirname;

const read = (name) => readFileSync(path.join(extensionDir, name), "utf8");

const sourceFiles = readdirSync(extensionDir).filter(
  (file) => file.endsWith(".js") && !file.endsWith(".test.js"),
);

// ---------------------------------------------------------------------------
// Guard 1 + 2: transport ownership and client neutrality
// ---------------------------------------------------------------------------

const CLIENT_FILE = "desktop-download-protocol.js";
const PORT_FILE = "desktop-port.js";

const LOOPBACK_URL = "127.0.0.1:39527";

/**
 * Files that may construct the injected WebSocket: the client itself and
 * background.js (the Chrome socket factory it injects). Nothing else.
 */
const SOCKET_FACTORY_ALLOWED = new Set([CLIENT_FILE, "background.js"]);

const referencesTransport = (source) =>
  TRANSPORT_REFERENCE_PATTERNS.some((pattern) => pattern.test(source));

const collectSourcesWithTransport = (sources) =>
  Object.entries(sources)
    .filter(([, source]) => referencesTransport(source))
    .map(([file]) => file);

describe("Desktop transport ownership", () => {
  it("keeps the loopback URL only in the Desktop protocol client", () => {
    const offenders = sourceFiles
      .filter((file) => file !== CLIENT_FILE)
      .filter((file) => read(file).includes(LOOPBACK_URL));
    expect(offenders, [
      "Loopback URL must live only in the Desktop protocol client.",
      ...offenders,
    ].join("\n")).toEqual([]);
  });

  it("keeps WebSocket construction only in the client and the injected background factory", () => {
    const offenders = sourceFiles
      .filter((file) => !SOCKET_FACTORY_ALLOWED.has(file))
      .filter((file) => /new WebSocket\(/.test(read(file)));
    expect(offenders, [
      "Only the Desktop client may construct WebSockets; background only via its injected createSocket factory.",
      ...offenders,
    ].join("\n")).toEqual([]);

    // Background composes but does not own wire policy: it must inject the
    // factory without ever seeing the loopback URL.
    expect(read("background.js")).toContain("createSocket(url)");
    expect(read("background.js")).not.toContain(LOOPBACK_URL);
  });

  it("keeps the pending-correlation envelope mechanics inside the client", () => {
    const clientSource = read(CLIENT_FILE);
    // The client must actually own the anchors the guards rely on.
    expect(clientSource).toContain(LOOPBACK_URL);
    expect(clientSource).toContain("createDesktopProtocolClient");
    expect(clientSource).toContain("tryConsumePendingResponse");
    // Acknowledge envelopes are classified only here.
    expect(clientSource).toContain("isAcknowledgementShape");
  });

  it("keeps the client and port runtime-neutral", () => {
    for (const file of [CLIENT_FILE, PORT_FILE]) {
      const source = read(file);
      expect(source, `${file} must not call chrome.*`).not.toMatch(/chrome\.[a-z]/);
      expect(source, `${file} must not touch the DOM`).not.toMatch(/document\./);
      expect(source, `${file} must not reference the page window`).not.toMatch(/window\./);
    }
    // The port legitimately names the Desktop wire actions (e.g.
    // xiaohongshu_drag_resolution_result), so site-word neutrality is
    // enforced on the client only, which must stay site-free.
    expect(read(CLIENT_FILE)).not.toMatch(
      /bilibili|youtube|twitter|pinterest|xiaohongshu|weibo|detector/,
    );
  });
});

// ---------------------------------------------------------------------------
// Guard 3: outbound actions stop at the port
// ---------------------------------------------------------------------------

const PORT_ACTIONS = [
  "video_selected_v2",
  "save_image",
  "save_data_url",
  "sync_download_preferences",
  "site_session_synced_summary",
  "site_session_sync_request",
  "site_session_enable_current_tab",
  "protected_image_resolution_result",
  "xiaohongshu_drag_resolution_result",
  "pasted_video_selection_result",
  "site_session_cookie_sync_result",
  "get_extension_debug_config",
];

describe("Desktop action boundary", () => {
  it("defines every outbound action at the port", () => {
    const portSource = read(PORT_FILE);
    for (const action of PORT_ACTIONS) {
      expect(portSource, `port must define ${action}`).toContain(`"${action}"`);
    }
    // Dual-use names (also internal runtime message types in the UI).
    expect(portSource).toContain('"get_language"');
    expect(portSource).toContain('"get_theme"');
  });

  it("keeps outbound raw actions out of every other module", () => {
    const offenders = sourceFiles
      .filter((file) => file !== PORT_FILE)
      .filter((file) => {
        const source = read(file);
        return PORT_ACTIONS.some((action) =>
          new RegExp(`["']${action}["']`).test(source),
        );
      });
    expect(offenders, [
      "Raw Desktop action strings stop at the port; feature/UI code calls port methods.",
      ...offenders,
    ].join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Guard 4: UI and content adapters cannot depend on the Desktop transport
// ---------------------------------------------------------------------------

const TRANSPORT_FREE_UI = [
  "popup.js",
  "options.js",
  "floating-launcher.js",
  "content-message-router.js",
  "generic-video-detector.js",
  "youtube-detector.js",
  "bilibili-detector.js",
  "twitter-detector.js",
  "pinterest-detector.js",
  "xiaohongshu-detector.js",
  "protected-image-detector.js",
  "injection-debug-config.js",
];

const TRANSPORT_REFERENCE_PATTERNS = [
  /WebSocket/,
  /127\.0\.0\.1/,
  /ws:\/\//,
  /createDesktopProtocolClient/,
];

describe("UI/content transport isolation", () => {
  it("keeps UI and content/site adapters free of Desktop transport references", () => {
    const sources = Object.fromEntries(
      TRANSPORT_FREE_UI.map((file) => [file, read(file)]),
    );
    const offenders = collectSourcesWithTransport(sources);
    expect(offenders, [
      "UI and content/site adapters must never reference the Desktop transport implementation.",
      ...offenders,
    ].join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Guard 5 + 6: one content resolver owner, manifest loads it first
// ---------------------------------------------------------------------------

const RESOLVER_DETECTORS = [
  "generic-video-detector.js",
  "youtube-detector.js",
  "bilibili-detector.js",
  "twitter-detector.js",
  "pinterest-detector.js",
  "xiaohongshu-detector.js",
];

describe("content resolver ownership", () => {
  it("has a singleton router that attaches exactly one listener", () => {
    const routerSource = read("content-message-router.js");
    expect(routerSource).toContain("__ameowContentRouterAttached");
    const listenerCount = (routerSource.match(/chrome\.runtime\.onMessage\.addListener/g) ?? []).length;
    expect(listenerCount).toBe(1);
  });

  it("registers every resolver-capable detector with the router", () => {
    for (const file of RESOLVER_DETECTORS) {
      expect(read(file), `${file} must register resolvers with the content router`).toContain(
        "registerResolver",
      );
    }
  });

  it("limits direct detector listeners to the language broadcast kind", () => {
    // Resolver kinds belong to the router. The only permitted direct
    // listener in a detector is the pre-existing `language_update` broadcast
    // (a distinct kind the router does not own).
    const offenders = RESOLVER_DETECTORS.filter(
      (file) =>
        /chrome\.runtime\.onMessage\.addListener/.test(read(file)) &&
        !read(file).includes("language_update"),
    );
    expect(offenders, [
      "Detector onMessage listeners may only handle the language_update broadcast; resolver kinds belong to the router.",
      ...offenders,
    ].join("\n")).toEqual([]);
  });

  it("loads the content router before the generic detector in the manifest", () => {
    const manifest = JSON.parse(read("manifest.json"));
    const allFrames = manifest.content_scripts.find(
      (entry) => entry.all_frames === true && entry.js.includes("generic-video-detector.js"),
    );
    expect(allFrames).toBeTruthy();
    const routerIndex = allFrames.js.indexOf("content-message-router.js");
    const genericIndex = allFrames.js.indexOf("generic-video-detector.js");
    expect(routerIndex).toBeGreaterThanOrEqual(0);
    expect(routerIndex).toBeLessThan(genericIndex);
  });
});

// ---------------------------------------------------------------------------
// Guard 7: runtime routing has one owner and unknown messages close the port
// ---------------------------------------------------------------------------

describe("runtime routing ownership", () => {
  it("attaches exactly one runtime message listener in the composition root", () => {
    const listenerCount = (read("background.js").match(/chrome\.runtime\.onMessage\.addListener/g) ?? []).length;
    expect(listenerCount).toBe(1);
  });

  it("falls through to false for unknown messages instead of leaving the channel open", () => {
    // Every handled branch returns true before falling through; the
    // listener's final statement is `return false;` so an unknown message
    // closes the async response port instead of keeping it open forever.
    const backgroundSource = read("background.js");
    const listenerStart = backgroundSource.indexOf(
      "chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {",
    );
    expect(listenerStart).toBeGreaterThanOrEqual(0);
    // The listener ends right before the next listener registration block.
    const listenerBody = backgroundSource.slice(
      listenerStart,
      backgroundSource.indexOf("\nif (chrome?.alarms?.onAlarm)"),
    );
    expect(listenerBody.trimEnd().endsWith("return false;\n});")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Guard 8: representative violations prove each guard fires
// ---------------------------------------------------------------------------

describe("guard detects representative violations", () => {
  const violationsFor = (sources) => {
    const offenders = collectSourcesWithTransport(sources);
    return offenders.length;
  };

  it("flags a loopback WebSocket in UI and content adapters", () => {
    expect(violationsFor({
      "popup.js": 'connect("ws://127.0.0.1:39527")',
      "floating-launcher.js": 'new WebSocket("ws://127.0.0.1:39527")',
      "twitter-detector.js": 'fetch("ws://127.0.0.1:39527")',
    })).toBe(3);
  });

  it("flags a raw action string outside the port", () => {
    expect('desktopClient.request("video_selected_v2", data)').toMatch(/["']video_selected_v2["']/);
  });

  it("flags a chrome.* call inside the client", () => {
    expect('chrome.tabs.query({})').toMatch(/chrome\.[a-z]/);
    expect(read(CLIENT_FILE)).not.toMatch(/chrome\.[a-z]/);
  });

  it("flags a non-language onMessage listener in a detector", () => {
    const foreignListener =
      "chrome.runtime.onMessage.addListener((m, s, sendResponse) => { resolveVideo(sendResponse) })";
    expect(/chrome\.runtime\.onMessage\.addListener/.test(foreignListener)).toBe(true);
    expect(foreignListener.includes("language_update")).toBe(false);
    // The real detectors: any listener they own must be the language kind.
    for (const file of RESOLVER_DETECTORS) {
      const source = read(file);
      if (/chrome\.runtime\.onMessage\.addListener/.test(source)) {
        expect(source, `${file} listener must be the language_update kind`).toContain(
          "language_update",
        );
      }
    }
  });
});
