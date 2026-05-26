import { describe, expect, it, vi } from "vitest";

import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import { createSupportLogCommandController } from "./supportLogCommands.mjs";

describe("createSupportLogCommandController", () => {
  it("supports only the support-log command", () => {
    const controller = createSupportLogCommandController({
      exportSupportLog: vi.fn(async () => "D:/Ameow/logs/support.txt"),
    });

    expect(controller.supports("export_support_log")).toBe(true);
    expect(controller.supports("get_config")).toBe(false);
    expect(controller.supports("save_config")).toBe(false);
    expect(controller.supports("queue_video_download")).toBe(false);
    expect(controller.supports("get_site_session_state")).toBe(false);
  });

  it("dispatches support-log export and returns the path unchanged", async () => {
    const exportSupportLog = vi.fn(async () => "D:/Ameow/logs/support-1.txt");
    const controller = createSupportLogCommandController({ exportSupportLog });
    const payload = { ignored: true };

    await expect(controller.invoke("export_support_log", payload)).resolves.toBe(
      "D:/Ameow/logs/support-1.txt",
    );

    expect(exportSupportLog).toHaveBeenCalledTimes(1);
    expect(exportSupportLog).toHaveBeenCalledWith();
  });

  it("dispatches support-log export when payload is omitted", async () => {
    const exportSupportLog = vi.fn(async () => "D:/Ameow/logs/support-2.txt");
    const controller = createSupportLogCommandController({ exportSupportLog });

    await expect(controller.invoke("export_support_log")).resolves.toBe(
      "D:/Ameow/logs/support-2.txt",
    );

    expect(exportSupportLog).toHaveBeenCalledTimes(1);
  });

  it("passes through support-log export rejections without wrapping them", async () => {
    const error = new Error("support log failed");
    const controller = createSupportLogCommandController({
      exportSupportLog: vi.fn(async () => {
        throw error;
      }),
    });

    let caught: unknown;
    try {
      await controller.invoke("export_support_log", { ignored: true });
    } catch (error_) {
      caught = error_;
    }

    expect(caught).toBe(error);
  });

  it("throws the existing unsupported Electron command error when invoked directly with an unknown command", async () => {
    const controller = createSupportLogCommandController({
      exportSupportLog: vi.fn(async () => "D:/Ameow/logs/support.txt"),
    });

    await expect(controller.invoke("get_config" as AmeowRendererCommand))
      .rejects.toThrow("Unsupported Electron command: get_config");
  });
});
