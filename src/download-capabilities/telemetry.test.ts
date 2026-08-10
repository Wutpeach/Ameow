import { describe, expect, it } from "vitest";
import type { ResolvedDownloadPlan } from "../core/index.js";
import { createDownloadTelemetryEvent } from "./telemetry.js";

const createPlan = (engine: string): ResolvedDownloadPlan => ({
  providerId: "test-provider",
  label: "Test plan",
  intent: {
    type: "video",
    siteId: "generic",
    originalUrl: "https://example.com/page/42",
    pageUrl: "https://example.com/page/42",
    priority: 100,
    candidates: [],
    preferredFormat: "best",
  },
  engines: [
    {
      engine,
      priority: 100,
      when: "primary",
      reason: "test engine",
      sourceUrl: "https://example.com/page/42",
    },
  ],
});

describe("download telemetry event", () => {
  it("accepts an opaque registered engine id without a central union edit", () => {
    const event = createDownloadTelemetryEvent({
      traceId: "trace-1",
      request: { url: "https://example.com/page/42" },
      plan: createPlan("fake-engine"),
      chosenEngine: "fake-engine",
    });

    expect(event.engineChain).toEqual(["fake-engine"]);
    expect(event.chosenEngine).toBe("fake-engine");
  });

  it("keeps existing yt-dlp/gallery-dl string values compatible", () => {
    const event = createDownloadTelemetryEvent({
      traceId: "trace-1",
      request: { url: "https://example.com/page/42" },
      plan: createPlan("yt-dlp"),
      chosenEngine: "yt-dlp",
    });

    expect(event.engineChain).toEqual(["yt-dlp"]);
    expect(event.chosenEngine).toBe("yt-dlp");
  });
});
