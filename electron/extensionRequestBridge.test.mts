import { describe, expect, it, vi } from "vitest";

import { createExtensionRequestBridge } from "./extensionRequestBridge.mjs";

describe("createExtensionRequestBridge", () => {
  it("broadcasts pasted selection requests and resolves correlated results", async () => {
    const broadcast = vi.fn();
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 1,
      broadcast,
      nextRequestId: () => "request-1",
      timeoutMs: 1000,
    });

    const resolutionPromise = bridge.requestPastedVideoSelectionResolution({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    });

    expect(broadcast).toHaveBeenCalledWith({
      action: "resolve_pasted_video_selection",
      data: {
        requestId: "request-1",
        url: "https://www.youtube.com/watch?v=abc123",
        pageUrl: "https://www.youtube.com/watch?v=abc123",
        siteHint: "youtube",
      },
    });

    expect(bridge.handlePastedVideoSelectionResult({
      correlationRequestId: "request-1",
      success: true,
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      title: "Example",
      videoQuality: "balanced",
    })).toEqual({
      success: true,
      message: "pasted_video_selection_received",
    });

    await expect(resolutionPromise).resolves.toMatchObject({
      success: true,
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      title: "Example",
      videoQuality: "balanced",
    });
  });

  it("rejects pasted selection requests when no extension is connected", async () => {
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 0,
      broadcast: vi.fn(),
      nextRequestId: () => "request-1",
      timeoutMs: 1000,
    });

    await expect(bridge.requestPastedVideoSelectionResolution({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    })).rejects.toThrow("Browser extension is not connected");
  });

  it("returns a failed acknowledgement for unknown pasted selection correlations", () => {
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 1,
      broadcast: vi.fn(),
      nextRequestId: () => "request-1",
      timeoutMs: 1000,
    });

    expect(bridge.handlePastedVideoSelectionResult({
      correlationRequestId: "missing-request",
      success: true,
    })).toEqual({
      success: false,
      message: "Unknown pasted video correlation request",
      code: "unknown_correlation_request",
    });
  });

  it("rejects pending pasted selection requests during shutdown cleanup", async () => {
    const bridge = createExtensionRequestBridge({
      getConnectedClientCount: () => 1,
      broadcast: vi.fn(),
      nextRequestId: () => "request-1",
      timeoutMs: 1000,
    });

    const resolutionPromise = bridge.requestPastedVideoSelectionResolution({
      url: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
      siteHint: "youtube",
    });

    bridge.rejectAllPendingRequests(new Error("Ameow is shutting down"));

    await expect(resolutionPromise).rejects.toThrow("Ameow is shutting down");
  });
});
