import { describe, expect, it } from "vitest";
import { bundledCapabilityRegistry } from "./seed.js";
import {
  createInteractionCapabilityDiagnostic,
  getRuntimeManualInteractionCapability,
  runtimeManualInteractionCapabilities,
} from "./runtime-interaction-capabilities.js";

describe("runtime interaction capabilities", () => {
  it("stays aligned with the bundled capability registry", () => {
    for (const capability of runtimeManualInteractionCapabilities) {
      expect(getRuntimeManualInteractionCapability(capability.siteId)).toEqual(capability);
      expect(bundledCapabilityRegistry.getInteractionCapabilities(capability.siteId)).toContainEqual(capability);
    }
  });

  it("builds a diagnostic payload for special-adapter sites and requested modes", () => {
    expect(createInteractionCapabilityDiagnostic({
      siteHint: "xiaohongshu",
      url: "https://www.xiaohongshu.com/explore/123",
      pageUrl: "https://www.xiaohongshu.com/explore/123",
      source: "page_bridge",
    })).toEqual({
      siteId: "xiaohongshu",
      interactionMode: "page_bridge",
      interactionStatus: "needs_special_adapter",
      supportedModes: ["paste", "drag", "context_menu", "injected_button", "page_bridge"],
      isModeSupported: true,
    });
  });

  it("returns the generic/unknown entry for unknown sites instead of throwing", () => {
    expect(getRuntimeManualInteractionCapability("fakesite")).toEqual({
      siteId: "generic",
      sourceId: "ameow-manual-sites",
      interactionStatus: "unknown",
      supportedModes: ["paste", "drag", "context_menu"],
    });
    expect(createInteractionCapabilityDiagnostic({
      siteHint: "fakesite",
      url: "https://example.com/video/1",
      source: "paste",
    })).toMatchObject({
      siteId: "generic",
      interactionStatus: "unknown",
    });
  });
});
