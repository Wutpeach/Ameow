import { describe, expect, it } from "vitest";
import { resolveLabOverlayFixture } from "./stateFixtures";
import {
  DEFAULT_LAB_SCENARIO_ID,
  LAB_COMPACT_SCENARIOS,
  LAB_SCENARIOS,
  resolveLabCompactScenario,
  resolveLabScenario,
} from "./scenarios";

describe("Lab scenario registry", () => {
  it("has one unique entry for every selectable production and reference scenario", () => {
    expect(DEFAULT_LAB_SCENARIO_ID).toBe("download-active");
    expect(new Set(LAB_SCENARIOS.map((scenario) => scenario.id)).size).toBe(LAB_SCENARIOS.length);
    expect(LAB_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "ripple-reference", "download-active", "download-queued", "transcode-active",
      "transcode-failed", "runtime-auto-config", "runtime-failed", "mixed-busy",
      "compact-neutral", "compact-pointer", "compact-reduced", "compact-surprised",
      "compact-curious", "compact-playful",
    ]);
  });

  it("resolves every registry entry through its real preview input", () => {
    for (const scenario of LAB_SCENARIOS) {
      expect(resolveLabScenario(scenario.id)).toBe(scenario);
      if (scenario.renderer === "overlay") expect(resolveLabOverlayFixture(scenario.fixtureId)).not.toBeNull();
      if (scenario.renderer === "compact") expect(resolveLabCompactScenario(scenario.id)).toBe(scenario);
    }
    expect(resolveLabScenario("nope")).toBeNull();
    expect(resolveLabCompactScenario("download-active")).toBeNull();
  });

  it("preserves the production Compact pose and pointer seams as registry-derived entries", () => {
    expect(LAB_COMPACT_SCENARIOS.map((scenario) => scenario.previewPose)).toEqual([
      "neutral", "neutral", "neutral", "surprised", "curious-short", "playful-short",
    ]);
    expect(LAB_COMPACT_SCENARIOS.find((scenario) => scenario.id === "compact-pointer")?.pointerMode).toBe("live");
  });
});
