import { describe, expect, it } from "vitest";
import type { DownloadEngine, DownloadResult } from "../core/index.js";
import { createEngineRegistry, EngineRegistry } from "./engine-registry.js";

const createEngine = (id: DownloadEngine["id"]): DownloadEngine => ({
  id,
  capabilities: { advancedQuality: id === "yt-dlp" },
  supports: () => ({ supported: true }),
  async execute(context): Promise<DownloadResult> {
    return {
      traceId: context.traceId,
      success: true,
      filePath: `/tmp/${id}.mp4`,
    };
  },
});

describe("EngineRegistry", () => {
  it("registers constructor engines and looks them up by id", () => {
    const registry = new EngineRegistry([createEngine("yt-dlp")]);

    expect(registry.get("yt-dlp")?.id).toBe("yt-dlp");
    expect(registry.list()).toHaveLength(1);
  });

  it("returns undefined for missing engines", () => {
    const registry = new EngineRegistry([]);

    expect(registry.get("yt-dlp")).toBeUndefined();
  });

  it("rejects duplicate ids explicitly instead of silently overwriting", () => {
    const registry = new EngineRegistry([createEngine("yt-dlp")]);

    expect(() => registry.register(createEngine("yt-dlp"))).toThrow(
      "Duplicate engine registration: yt-dlp",
    );
    expect(registry.list()).toHaveLength(1);
  });

  it("registers additional engines explicitly after construction", () => {
    const registry = new EngineRegistry([createEngine("yt-dlp")]);

    registry.register(createEngine("gallery-dl"));

    expect(registry.get("gallery-dl")?.id).toBe("gallery-dl");
    expect(registry.list()).toHaveLength(2);
  });

  it("reports capability eligibility for plan requirements", () => {
    const registry = new EngineRegistry([
      createEngine("yt-dlp"),
      createEngine("gallery-dl"),
    ]);

    expect(registry.isEligible("yt-dlp", { advancedQuality: true })).toBe(true);
    expect(registry.isEligible("gallery-dl", { advancedQuality: true })).toBe(false);
    expect(registry.isEligible("gallery-dl", undefined)).toBe(true);
    expect(registry.isEligible("yt-dlp", { advancedQuality: true })).toBe(true);
  });

  it("reports missing engines as ineligible", () => {
    const registry = new EngineRegistry([]);

    expect(registry.isEligible("yt-dlp")).toBe(false);
    expect(registry.listEligible()).toEqual([]);
  });

  it("filters registered engines by capability requirements", () => {
    const registry = new EngineRegistry([
      createEngine("yt-dlp"),
      createEngine("gallery-dl"),
    ]);

    expect(registry.listEligible({ advancedQuality: true }).map((engine) => engine.id))
      .toEqual(["yt-dlp"]);
    expect(registry.listEligible({ advancedQuality: false }).map((engine) => engine.id))
      .toEqual(["gallery-dl"]);
    expect(registry.listEligible(undefined)).toHaveLength(2);
  });

  it("createEngineRegistry factory supports an empty default", () => {
    expect(createEngineRegistry().list()).toEqual([]);
    expect(createEngineRegistry([createEngine("yt-dlp")]).get("yt-dlp")).toBeDefined();
  });
});
