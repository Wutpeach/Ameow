import { describe, expect, it } from "vitest";
import {
  normalizeYtdlpQualityPreference,
  resolveYtdlpQualityPreferenceFromConfig,
} from "./download-preferences.js";

describe("download preferences", () => {
  it("normalizes legacy quality aliases", () => {
    expect(normalizeYtdlpQualityPreference("high")).toBe("balanced");
    expect(normalizeYtdlpQualityPreference("standard")).toBe("data_saver");
    expect(normalizeYtdlpQualityPreference("best")).toBe("best");
  });

  it("prefers canonical config quality keys and defaults to best", () => {
    expect(resolveYtdlpQualityPreferenceFromConfig({
      defaultVideoDownloadQuality: "balanced",
      ytdlpQualityPreference: "best",
    })).toBe("balanced");
    expect(resolveYtdlpQualityPreferenceFromConfig({
      ytdlpQualityPreference: "standard",
    })).toBe("data_saver");
    expect(resolveYtdlpQualityPreferenceFromConfig({})).toBe("best");
  });
});
