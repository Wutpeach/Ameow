import { describe, expect, it, vi } from "vitest";

import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import {
  createSiteSessionCommandController,
  resolveSiteSessionIdFromPayload,
} from "./siteSessionCommands.mjs";

type SiteSessionMethod =
  | "getDiagnostics"
  | "getState"
  | "importSnapshot"
  | "clearSession";

const genericCommandCases = [
  ["get_site_session_diagnostics", "getDiagnostics"],
  ["get_site_session_state", "getState"],
  ["clear_site_session", "clearSession"],
] as const satisfies readonly [AmeowRendererCommand, SiteSessionMethod][];

const douyinAliasCommandCases = [
  ["get_douyin_session_state", "getState"],
  ["clear_douyin_session", "clearSession"],
] as const satisfies readonly [AmeowRendererCommand, SiteSessionMethod][];

const allSiteSessionCommands = [
  ...genericCommandCases.map(([command]) => command),
  ...douyinAliasCommandCases.map(([command]) => command),
  "get_site_session_registry",
  "sync_site_session_from_extension",
] as const satisfies readonly AmeowRendererCommand[];

const removedCaptureCommands = [
  "start_site_session_capture",
  "complete_site_session_capture",
  "cancel_site_session_capture",
  "refresh_site_session_credentials",
  "start_douyin_session_capture",
  "complete_douyin_session_capture",
  "cancel_douyin_session_capture",
] as const;

const createManager = (siteId: string) => ({
  getDiagnostics: vi.fn(async () => ({ siteId, method: "getDiagnostics" })),
  getState: vi.fn(async () => ({ siteId, method: "getState" })),
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
  };

  const requireSiteSessionManager = vi.fn((siteId: string) => {
    const manager = managers[siteId as keyof typeof managers];
    if (!manager) {
      throw new Error(`Unsupported site session: ${siteId ?? ""}`);
    }
    return manager;
  });

  const registryEntries = [
    {
      siteId: "youtube",
      displayName: "YouTube",
    },
  ];

  const controller = createSiteSessionCommandController({
    listSiteSessionRegistryEntries: () => registryEntries as never,
    requireSiteSessionManager,
    resolveSiteSessionIdFromPayload,
  });

  return {
    controller,
    managers,
    registryEntries,
    requireSiteSessionManager,
  };
};

describe("createSiteSessionCommandController", () => {
  it("supports only active site-session commands", () => {
    const { controller } = createControllerHarness();

    for (const command of allSiteSessionCommands) {
      expect(controller.supports(command)).toBe(true);
    }
    for (const command of removedCaptureCommands) {
      expect(controller.supports(command as AmeowRendererCommand)).toBe(false);
    }

    expect(controller.supports("get_config")).toBe(false);
    expect(controller.supports("save_config")).toBe(false);
    expect(controller.supports("queue_video_download")).toBe(false);
  });

  it("returns registry entries without resolving a site manager", async () => {
    const { controller, registryEntries, requireSiteSessionManager } = createControllerHarness();

    await expect(controller.invoke("get_site_session_registry")).resolves.toBe(registryEntries);
    expect(requireSiteSessionManager).not.toHaveBeenCalled();
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

    expect(requireSiteSessionManager).toHaveBeenCalledWith("douyin");
    expect(managers.douyin.getState).toHaveBeenCalledTimes(1);
  });

  it("dispatches active Douyin aliases to the Douyin manager and ignores payload siteId", async () => {
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
    expect(managers.youtube.clearSession).not.toHaveBeenCalled();
  });

  it("passes through manager-missing errors without rewriting them", async () => {
    const { controller } = createControllerHarness();

    await expect(controller.invoke("get_site_session_state", { siteId: "unsupported" }))
      .rejects.toThrow("Unsupported site session: unsupported");
  });

  it("throws the existing unsupported Electron command error when invoked directly with an unknown command", async () => {
    const { controller } = createControllerHarness();

    await expect(controller.invoke("get_config" as AmeowRendererCommand))
      .rejects.toThrow("Unsupported Electron command: get_config");
  });

  it("passes through manager promise rejections without wrapping them", async () => {
    const error = new Error("clear failed");
    const manager = createManager("douyin");
    manager.clearSession.mockRejectedValueOnce(error);
    const controller = createSiteSessionCommandController({
      listSiteSessionRegistryEntries: () => [],
      requireSiteSessionManager: vi.fn(() => manager),
      resolveSiteSessionIdFromPayload,
    });

    let caught: unknown;
    try {
      await controller.invoke("clear_site_session", { siteId: "douyin" });
    } catch (error_) {
      caught = error_;
    }

    expect(caught).toBe(error);
  });

  it("syncs any registry-backed site session through the injected extension sync dependency", async () => {
    const { managers, requireSiteSessionManager } = createControllerHarness();
    const syncSiteSessionFromExtension = vi.fn(async () => ({
      siteId: "bilibili",
      availability: "ready",
      updatedAtMs: 123,
      cookieCount: 1,
      requiredKeys: ["SESSDATA"],
      missingRequiredKeys: [],
      lastError: null,
      sessionFilePath: "site-sessions/bilibili.json",
      lastSyncSource: {
        browser: "chrome",
        profileLabel: "Default",
        extensionId: "extension-id",
      },
    } as const));
    const controller = createSiteSessionCommandController({
      listSiteSessionRegistryEntries: () => [],
      requireSiteSessionManager,
      resolveSiteSessionIdFromPayload,
      syncSiteSessionFromExtension,
    });

    await expect(controller.invoke("sync_site_session_from_extension", { siteId: "bilibili" }))
      .resolves.toMatchObject({
        siteId: "bilibili",
        availability: "ready",
      });

    expect(requireSiteSessionManager).toHaveBeenCalledWith("bilibili");
    expect(syncSiteSessionFromExtension).toHaveBeenCalledWith("bilibili", managers.bilibili);
    expect(managers.bilibili.importSnapshot).not.toHaveBeenCalled();
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
    const resolver = vi.fn(() => "bilibili");
    const controller = createSiteSessionCommandController({
      listSiteSessionRegistryEntries: () => [],
      requireSiteSessionManager: vi.fn(() => manager),
      resolveSiteSessionIdFromPayload: resolver,
    });

    await controller.invoke("clear_site_session", payload);

    expect(resolver).toHaveBeenCalledWith(payload);
    expect(manager.clearSession).toHaveBeenCalledTimes(1);
  });
});

describe("resolveSiteSessionIdFromPayload", () => {
  it("keeps the fallback while accepting dynamic site ids", () => {
    expect(resolveSiteSessionIdFromPayload(undefined)).toBe("douyin");
    expect(resolveSiteSessionIdFromPayload({})).toBe("douyin");
    expect(resolveSiteSessionIdFromPayload({ siteId: "instagram" })).toBe("instagram");
    expect(resolveSiteSessionIdFromPayload({ siteId: "unknown-site" })).toBe("unknown-site");
    expect(() => resolveSiteSessionIdFromPayload({ siteId: "   " }))
      .toThrow("Unsupported site session:");
  });
});
