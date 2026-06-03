import { describe, expect, it, vi } from "vitest";

import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import type { SupportedSiteSessionId } from "../src/types/siteSession.js";
import {
  createSiteSessionCommandController,
  resolveSiteSessionIdFromPayload,
} from "./siteSessionCommands.mjs";

type SiteSessionMethod =
  | "getDiagnostics"
  | "getState"
  | "startCapture"
  | "confirmCapture"
  | "cancelCapture"
  | "refreshCredentials"
  | "importSnapshot"
  | "clearSession";

const genericCommandCases = [
  ["get_site_session_diagnostics", "getDiagnostics"],
  ["get_site_session_state", "getState"],
  ["start_site_session_capture", "startCapture"],
  ["complete_site_session_capture", "confirmCapture"],
  ["cancel_site_session_capture", "cancelCapture"],
  ["refresh_site_session_credentials", "refreshCredentials"],
  ["clear_site_session", "clearSession"],
] as const satisfies readonly [AmeowRendererCommand, SiteSessionMethod][];

const douyinAliasCommandCases = [
  ["get_douyin_session_state", "getState"],
  ["start_douyin_session_capture", "startCapture"],
  ["complete_douyin_session_capture", "confirmCapture"],
  ["cancel_douyin_session_capture", "cancelCapture"],
  ["clear_douyin_session", "clearSession"],
] as const satisfies readonly [AmeowRendererCommand, SiteSessionMethod][];

const allSiteSessionCommands = [
  ...genericCommandCases.map(([command]) => command),
  ...douyinAliasCommandCases.map(([command]) => command),
];

const createManager = (siteId: SupportedSiteSessionId) => ({
  getDiagnostics: vi.fn(async () => ({ siteId, method: "getDiagnostics" })),
  getState: vi.fn(async () => ({ siteId, method: "getState" })),
  startCapture: vi.fn(async () => ({ siteId, method: "startCapture" })),
  confirmCapture: vi.fn(async () => ({ siteId, method: "confirmCapture" })),
  cancelCapture: vi.fn(async () => ({ siteId, method: "cancelCapture" })),
  refreshCredentials: vi.fn(async () => ({ siteId, method: "refreshCredentials" })),
  importSnapshot: vi.fn(async () => ({ siteId, method: "importSnapshot" })),
  clearSession: vi.fn(async () => ({ siteId, method: "clearSession" })),
});

const createControllerHarness = () => {
  const managers = {
    bilibili: createManager("bilibili"),
    douyin: createManager("douyin"),
    instagram: createManager("instagram"),
    xiaohongshu: createManager("xiaohongshu"),
    youtube: createManager("youtube"),
  } satisfies Record<SupportedSiteSessionId, ReturnType<typeof createManager>>;

  const requireSiteSessionManager = vi.fn((siteId: SupportedSiteSessionId) => {
    const manager = managers[siteId];
    if (!manager) {
      throw new Error(`Unsupported site session: ${siteId ?? ""}`);
    }
    return manager;
  });

  const controller = createSiteSessionCommandController({
    requireSiteSessionManager,
    resolveSiteSessionIdFromPayload,
  });

  return {
    controller,
    managers,
    requireSiteSessionManager,
  };
};

describe("createSiteSessionCommandController", () => {
  it("supports only site-session commands", () => {
    const { controller } = createControllerHarness();

    for (const command of allSiteSessionCommands) {
      expect(controller.supports(command)).toBe(true);
    }

    expect(controller.supports("get_config")).toBe(false);
    expect(controller.supports("save_config")).toBe(false);
    expect(controller.supports("queue_video_download")).toBe(false);
    expect(controller.supports("sync_site_session_from_extension")).toBe(true);
  });

  it("dispatches generic site-session commands to the resolved site manager", async () => {
    const { controller, managers, requireSiteSessionManager } = createControllerHarness();

    for (const [command, method] of genericCommandCases) {
      await expect(controller.invoke(command, { siteId: "youtube", marker: "keep" })).resolves.toMatchObject({
        siteId: "youtube",
        method,
      });

      expect(requireSiteSessionManager).toHaveBeenLastCalledWith("youtube");
      expect(managers.youtube[method]).toHaveBeenCalledTimes(1);
    }
  });

  it("falls generic site-session commands back to the Douyin manager when siteId is absent", async () => {
    const { controller, managers, requireSiteSessionManager } = createControllerHarness();

    await expect(controller.invoke("get_site_session_state")).resolves.toMatchObject({
      siteId: "douyin",
      method: "getState",
    });
    await expect(controller.invoke("start_site_session_capture", null as never)).resolves.toMatchObject({
      siteId: "douyin",
      method: "startCapture",
    });

    expect(requireSiteSessionManager).toHaveBeenNthCalledWith(1, "douyin");
    expect(requireSiteSessionManager).toHaveBeenNthCalledWith(2, "douyin");
    expect(managers.douyin.getState).toHaveBeenCalledTimes(1);
    expect(managers.douyin.startCapture).toHaveBeenCalledTimes(1);
  });

  it("dispatches Douyin aliases to the Douyin manager and ignores payload siteId", async () => {
    const { controller, managers, requireSiteSessionManager } = createControllerHarness();

    for (const [command, method] of douyinAliasCommandCases) {
      await expect(controller.invoke(command, { siteId: "youtube" })).resolves.toMatchObject({
        siteId: "douyin",
        method,
      });

      expect(requireSiteSessionManager).toHaveBeenLastCalledWith("douyin");
      expect(managers.douyin[method]).toHaveBeenCalledTimes(1);
    }

    expect(managers.youtube.getState).not.toHaveBeenCalled();
    expect(managers.youtube.startCapture).not.toHaveBeenCalled();
    expect(managers.youtube.getDiagnostics).not.toHaveBeenCalled();
    expect(managers.youtube.confirmCapture).not.toHaveBeenCalled();
    expect(managers.youtube.cancelCapture).not.toHaveBeenCalled();
    expect(managers.youtube.refreshCredentials).not.toHaveBeenCalled();
    expect(managers.youtube.clearSession).not.toHaveBeenCalled();
  });

  it("throws the existing unsupported site-session error before resolving a manager", async () => {
    const { controller, requireSiteSessionManager } = createControllerHarness();

    await expect(controller.invoke("get_site_session_state", { siteId: "unsupported" }))
      .rejects.toThrow("Unsupported site session: unsupported");
    expect(requireSiteSessionManager).not.toHaveBeenCalled();
  });

  it("passes through manager-missing errors without rewriting them", async () => {
    const requireSiteSessionManager = vi.fn((siteId: SupportedSiteSessionId) => {
      throw new Error(`Unsupported site session: ${siteId ?? ""}`);
    });
    const controller = createSiteSessionCommandController({
      requireSiteSessionManager,
      resolveSiteSessionIdFromPayload,
    });

    await expect(controller.invoke("get_site_session_state", { siteId: "douyin" }))
      .rejects.toThrow("Unsupported site session: douyin");
  });

  it("throws the existing unsupported Electron command error when invoked directly with an unknown command", async () => {
    const { controller } = createControllerHarness();

    await expect(controller.invoke("get_config" as AmeowRendererCommand))
      .rejects.toThrow("Unsupported Electron command: get_config");
  });

  it("passes through manager promise rejections without wrapping them", async () => {
    const error = new Error("capture failed");
    const manager = createManager("douyin");
    manager.startCapture.mockRejectedValueOnce(error);
    const controller = createSiteSessionCommandController({
      requireSiteSessionManager: vi.fn(() => manager),
      resolveSiteSessionIdFromPayload,
    });

    let caught: unknown;
    try {
      await controller.invoke("start_site_session_capture", { siteId: "douyin" });
    } catch (error_) {
      caught = error_;
    }

    expect(caught).toBe(error);
  });

  it("syncs the YouTube site session through the injected extension sync dependency", async () => {
    const { managers, requireSiteSessionManager } = createControllerHarness();
    const syncSiteSessionFromExtension = vi.fn(async () => ({
      siteId: "youtube",
      availability: "ready",
      updatedAtMs: 123,
      cookieCount: 2,
      requiredKeys: [],
      missingRequiredKeys: [],
      lastError: null,
      sessionFilePath: "site-sessions/youtube.json",
      capturePhase: "idle",
      captureStartedAtMs: null,
      capturePid: null,
      lastSyncSource: {
        browser: "chrome",
        profileLabel: "Default",
        extensionId: "extension-id",
      },
    } as const));
    const controller = createSiteSessionCommandController({
      requireSiteSessionManager,
      resolveSiteSessionIdFromPayload,
      syncSiteSessionFromExtension,
    });

    await expect(controller.invoke("sync_site_session_from_extension", { siteId: "youtube" }))
      .resolves.toMatchObject({
        siteId: "youtube",
        availability: "ready",
        lastSyncSource: {
          browser: "chrome",
          profileLabel: "Default",
          extensionId: "extension-id",
        },
      });

    expect(requireSiteSessionManager).toHaveBeenCalledWith("youtube");
    expect(syncSiteSessionFromExtension).toHaveBeenCalledWith("youtube", managers.youtube);
    expect(managers.youtube.importSnapshot).not.toHaveBeenCalled();
  });

  it("rejects extension site-session sync for non-YouTube sites", async () => {
    const { controller, requireSiteSessionManager } = createControllerHarness();

    await expect(controller.invoke("sync_site_session_from_extension", { siteId: "bilibili" }))
      .rejects.toThrow("Extension site session sync is currently only supported for YouTube");
    expect(requireSiteSessionManager).not.toHaveBeenCalled();
  });

  it("rejects extension site-session sync when the dependency is not configured", async () => {
    const { controller, requireSiteSessionManager } = createControllerHarness();

    await expect(controller.invoke("sync_site_session_from_extension", { siteId: "youtube" }))
      .rejects.toThrow("Extension site session sync is not configured");
    expect(requireSiteSessionManager).not.toHaveBeenCalled();
  });

  it("passes the original payload object to the injected site-id resolver", async () => {
    const manager = createManager("bilibili");
    const payload = { siteId: "bilibili", marker: "keep" };
    const resolver = vi.fn(() => "bilibili" as const);
    const controller = createSiteSessionCommandController({
      requireSiteSessionManager: vi.fn(() => manager),
      resolveSiteSessionIdFromPayload: resolver,
    });

    await controller.invoke("clear_site_session", payload);

    expect(resolver).toHaveBeenCalledWith(payload);
    expect(manager.clearSession).toHaveBeenCalledTimes(1);
  });
});

describe("resolveSiteSessionIdFromPayload", () => {
  it("keeps the current fallback and unsupported-site behavior", () => {
    expect(resolveSiteSessionIdFromPayload(undefined)).toBe("douyin");
    expect(resolveSiteSessionIdFromPayload({})).toBe("douyin");
    expect(resolveSiteSessionIdFromPayload({ siteId: "instagram" })).toBe("instagram");
    expect(() => resolveSiteSessionIdFromPayload({ siteId: "unknown" }))
      .toThrow("Unsupported site session: unknown");
  });
});
