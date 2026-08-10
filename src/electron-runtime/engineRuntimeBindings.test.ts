import { describe, expect, it, vi } from "vitest";
import {
  createEngineRuntimeBindingRegistry,
  EngineRuntimeBindingRegistry,
} from "./engineRuntimeBindings.js";

const createBinding = (engineId: "yt-dlp" | "gallery-dl") => ({
  engineId,
  networkConsumer: engineId,
  proxyFailureLayer: `${engineId}_layer`,
  ensureReady: vi.fn(async () => undefined),
});

describe("EngineRuntimeBindingRegistry", () => {
  it("looks up production bindings by engine id", () => {
    const ytBinding = createBinding("yt-dlp");
    const galleryBinding = createBinding("gallery-dl");
    const registry = new EngineRuntimeBindingRegistry([ytBinding, galleryBinding]);

    expect(registry.require("yt-dlp")).toBe(ytBinding);
    expect(registry.require("gallery-dl").proxyFailureLayer).toBe("gallery-dl_layer");
    expect(registry.list()).toHaveLength(2);
  });

  it("fails closed for unknown engine ids instead of defaulting", () => {
    const registry = createEngineRuntimeBindingRegistry([createBinding("yt-dlp")]);

    expect(() => registry.require("unknown-engine")).toThrow(expect.objectContaining({
      code: "E_ENGINE_NOT_FOUND",
      message: "No engine runtime binding for unknown-engine",
    }));
    expect(() => registry.require(undefined)).toThrow(expect.objectContaining({
      code: "E_ENGINE_NOT_FOUND",
      message: "No engine runtime binding for unknown engine id",
    }));
    expect(registry.get("unknown-engine")).toBeUndefined();
  });

  it("rejects duplicate and blank bindings explicitly", () => {
    const registry = new EngineRuntimeBindingRegistry();

    registry.register(createBinding("yt-dlp"));
    expect(() => registry.register(createBinding("yt-dlp"))).toThrow(
      "Duplicate engine runtime binding: yt-dlp",
    );
    expect(() => registry.register({
      engineId: " ",
      networkConsumer: "yt-dlp",
      proxyFailureLayer: "yt_dlp",
      ensureReady: vi.fn(async () => undefined),
    })).toThrow(
      "Engine runtime binding requires a canonical non-blank engine id",
    );
    expect(registry.list()).toHaveLength(1);
  });

  it("rejects blank and padded network consumer labels", () => {
    const registry = new EngineRuntimeBindingRegistry();
    const base = { proxyFailureLayer: "yt_dlp", ensureReady: vi.fn(async () => undefined) };

    expect(() => registry.register({ engineId: "yt-dlp", networkConsumer: " ", ...base })).toThrow(
      "Engine runtime binding requires a canonical non-blank network consumer",
    );
    expect(() => registry.register({ engineId: "yt-dlp", networkConsumer: " yt-dlp ", ...base })).toThrow(
      "Engine runtime binding requires a canonical non-blank network consumer",
    );
    expect(registry.list()).toHaveLength(0);
  });

  it("registers a fake non-managed engine binding with a no-op readiness and an opaque consumer", () => {
    const ensureReady = vi.fn(async () => undefined);
    const registry = createEngineRuntimeBindingRegistry([
      {
        engineId: "fake-engine",
        networkConsumer: "fake-engine",
        proxyFailureLayer: "fake_engine_layer",
        ensureReady,
      },
    ]);

    const binding = registry.require("fake-engine");
    expect(binding.networkConsumer).toBe("fake-engine");
    expect(binding.proxyFailureLayer).toBe("fake_engine_layer");
    // No-op readiness must not touch managed runtime status/types.
    expect(ensureReady).not.toHaveBeenCalled();
    expect(registry.list()).toHaveLength(1);
  });

  it("asserts the registered engine id set matches the bindings exactly", () => {
    const registry = new EngineRuntimeBindingRegistry([
      createBinding("yt-dlp"),
      createBinding("gallery-dl"),
    ]);

    expect(() => registry.assertCoversEngineIds(["yt-dlp", "gallery-dl"])).not.toThrow();

    expect(() => registry.assertCoversEngineIds(["yt-dlp"])).toThrow(
      "Engine runtime binding without a registered engine: gallery-dl",
    );
    expect(() => registry.assertCoversEngineIds(["yt-dlp", "gallery-dl", "fake-engine"])).toThrow(
      "Missing engine runtime binding for fake-engine",
    );
  });
});
