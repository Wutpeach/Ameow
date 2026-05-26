import { describe, expect, it, vi } from "vitest";

import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import {
  dispatchRendererCommandToControllers,
  type RendererCommandController,
  type RendererCommandControllerGetter,
} from "./rendererCommandControllerRegistry.mjs";

const createController = ({
  supports,
  value,
}: {
  supports: boolean;
  value: unknown;
}): RendererCommandController & {
  supports: ReturnType<typeof vi.fn>;
  invoke: ReturnType<typeof vi.fn>;
} => ({
  supports: vi.fn(() => supports),
  invoke: vi.fn(async () => value),
});

describe("dispatchRendererCommandToControllers", () => {
  it("checks controller getters in order until the first match", async () => {
    const calls: string[] = [];
    const first = createController({ supports: false, value: "first" });
    const second = createController({ supports: true, value: "second" });
    const third = createController({ supports: true, value: "third" });
    const getters: RendererCommandControllerGetter[] = [
      () => {
        calls.push("first");
        return first;
      },
      () => {
        calls.push("second");
        return second;
      },
      () => {
        calls.push("third");
        return third;
      },
    ];

    const result = await dispatchRendererCommandToControllers(
      getters,
      "export_support_log",
    );

    expect(result).toEqual({ handled: true, value: "second" });
    expect(calls).toEqual(["first", "second"]);
    expect(first.supports).toHaveBeenCalledWith("export_support_log");
    expect(second.supports).toHaveBeenCalledWith("export_support_log");
    expect(third.supports).not.toHaveBeenCalled();
    expect(second.invoke).toHaveBeenCalledTimes(1);
    expect(third.invoke).not.toHaveBeenCalled();
  });

  it("lets the first supporting controller win when command sets overlap", async () => {
    const first = createController({ supports: true, value: "first" });
    const second = createController({ supports: true, value: "second" });

    const result = await dispatchRendererCommandToControllers(
      [() => first, () => second],
      "queue_video_download",
    );

    expect(result).toEqual({ handled: true, value: "first" });
    expect(first.invoke).toHaveBeenCalledTimes(1);
    expect(second.invoke).not.toHaveBeenCalled();
  });

  it("returns an unhandled result when no controller supports the command", async () => {
    const first = createController({ supports: false, value: "first" });
    const second = createController({ supports: false, value: "second" });

    const result = await dispatchRendererCommandToControllers(
      [() => first, () => second],
      "get_config",
    );

    expect(result).toEqual({ handled: false });
    expect(first.supports).toHaveBeenCalledWith("get_config");
    expect(second.supports).toHaveBeenCalledWith("get_config");
    expect(first.invoke).not.toHaveBeenCalled();
    expect(second.invoke).not.toHaveBeenCalled();
  });

  it("does not consume switch commands such as get_config when controllers do not support them", async () => {
    const controller = createController({ supports: false, value: "config" });

    const result = await dispatchRendererCommandToControllers(
      [() => controller],
      "get_config",
      { ignored: true },
    );

    if (result.handled) {
      throw new Error("get_config should fall through to the main switch");
    }
    expect(result.handled).toBe(false);
    expect(controller.invoke).not.toHaveBeenCalled();
  });

  it("passes the original payload object to the invoked controller", async () => {
    const controller = createController({ supports: true, value: "ok" });
    const payload = { marker: "same-object" };

    await dispatchRendererCommandToControllers(
      [() => controller],
      "export_support_log",
      payload,
    );

    expect(controller.invoke).toHaveBeenCalledWith("export_support_log", payload);
  });

  it("passes through controller rejection identity without wrapping", async () => {
    const error = new Error("controller failed");
    const controller = createController({ supports: true, value: "unused" });
    controller.invoke.mockRejectedValueOnce(error);

    let caught: unknown;
    try {
      await dispatchRendererCommandToControllers(
        [() => controller],
        "export_support_log",
      );
    } catch (error_) {
      caught = error_;
    }

    expect(caught).toBe(error);
  });

  it("passes through getter errors without wrapping", async () => {
    const error = new Error("getter failed");

    let caught: unknown;
    try {
      await dispatchRendererCommandToControllers(
        [() => {
          throw error;
        }],
        "export_support_log",
      );
    } catch (error_) {
      caught = error_;
    }

    expect(caught).toBe(error);
  });

  it("lets callers preserve the existing unknown command error text after a miss", async () => {
    const result = await dispatchRendererCommandToControllers(
      [],
      "unknown_command" as AmeowRendererCommand,
    );

    expect(() => {
      if (!result.handled) {
        throw new Error("Unsupported Electron command: unknown_command");
      }
    }).toThrow("Unsupported Electron command: unknown_command");
  });
});
