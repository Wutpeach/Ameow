import { describe, expect, it } from "vitest";
import type { ResolvedDownloadPlan } from "../core/index.js";
import {
  createDownloadTelemetryEvent,
  downloadTelemetryEventSchema,
} from "./telemetry.js";

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

  it("never persists raw messages while keeping structured attempt facts", () => {
    const event = createDownloadTelemetryEvent({
      traceId: "trace-1",
      request: { url: "https://example.com/watch/42?token=secret" },
      plan: createPlan("yt-dlp"),
      chosenEngine: "yt-dlp",
      error: {
        code: "E_EXECUTION_FAILED",
        classification: "auth_required",
        message: "cookies required for this resource",
      },
      diagnosticSummary: {
        attemptCount: 2,
        attempts: [
          {
            attemptIndex: 1,
            engineId: "yt-dlp",
            cycle: "initial",
            outcome: "failed",
            errorCode: "E_EXECUTION_FAILED",
            classification: "fallback_to_other_engine",
            category: "engine_execution",
          },
          {
            attemptIndex: 2,
            engineId: "gallery-dl",
            cycle: "auth_recovery",
            outcome: "failed",
            errorCode: "E_EXECUTION_FAILED",
            classification: "auth_required",
            category: "authentication_required",
          },
        ],
        finalCategory: "authentication_required",
      },
    });

    expect(event.errorMessage).toBeNull();
    expect(event.errorCode).toBe("E_EXECUTION_FAILED");
    expect(event.errorClassification).toBe("auth_required");
    expect(event.diagnosticCategory).toBe("authentication_required");
    expect(event.attemptCount).toBe(2);
    expect(event.attempts).toEqual([
      {
        attemptIndex: 1,
        engineId: "yt-dlp",
        cycle: "initial",
        outcome: "failed",
        errorCode: "E_EXECUTION_FAILED",
        classification: "fallback_to_other_engine",
        category: "engine_execution",
      },
      {
        attemptIndex: 2,
        engineId: "gallery-dl",
        cycle: "auth_recovery",
        outcome: "failed",
        errorCode: "E_EXECUTION_FAILED",
        classification: "auth_required",
        category: "authentication_required",
      },
    ]);
    // The persisted event itself validates against the closed schema.
    expect(downloadTelemetryEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects unbounded attempt history at the event boundary", () => {
    // The recorder already caps history at 8; this is the defensive backstop
    // that keeps an oversized summary from ever reaching the persisted file.
    expect(() => createDownloadTelemetryEvent({
      traceId: "trace-1",
      request: { url: "https://example.com/page/42" },
      plan: createPlan("yt-dlp"),
      chosenEngine: "yt-dlp",
      error: {
        code: "E_EXECUTION_FAILED",
        classification: "fallback_to_other_engine",
        message: "boom",
      },
      diagnosticSummary: {
        attemptCount: 9,
        attempts: Array.from({ length: 9 }, (_, index) => ({
          attemptIndex: index + 1,
          engineId: "yt-dlp",
          cycle: "initial" as const,
          outcome: "failed" as const,
          errorCode: "E_EXECUTION_FAILED" as const,
          classification: "fallback_to_other_engine" as const,
          category: "engine_execution" as const,
        })),
        finalCategory: "engine_execution",
      },
    })).toThrow(/expected array to have <=8 items/);
  });
});
