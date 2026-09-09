import { describe, expect, it } from "vitest";
import {
  LAB_COMPACT_SCENARIOS,
  LAB_COMPACT_SCENARIO_IDS,
  resolveLabCompactScenario,
} from "./scenarios";

describe("Lab Compact scenarios", () => {
  it("retains the accepted previewPose seam without Full experiment state", () => {
    expect(LAB_COMPACT_SCENARIO_IDS).toEqual([
      "compact-neutral",
      "compact-pointer",
      "compact-reduced",
      "compact-surprised",
      "compact-curious",
      "compact-playful",
    ]);
    expect(LAB_COMPACT_SCENARIOS.map((scenario) => scenario.previewPose)).toEqual([
      "neutral", "neutral", "neutral", "surprised", "curious-short", "playful-short",
    ]);
    expect(resolveLabCompactScenario("nope")).toBeNull();
  });
});
