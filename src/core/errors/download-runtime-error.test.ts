import { describe, expect, it } from "vitest";
import { DownloadRuntimeError } from "./download-runtime-error.js";

describe("DownloadRuntimeError", () => {
  it("classifies direct source validation as fallback-to-other-engine", () => {
    const error = new DownloadRuntimeError(
      "E_DIRECT_SOURCE_REQUIRED",
      "Direct engine requires a direct media URL",
    );

    expect(error.classification).toBe("fallback_to_other_engine");
    expect(error.fallbackable).toBe(true);
  });

  it("classifies invalid engine plans as terminal-for-site", () => {
    const error = new DownloadRuntimeError(
      "E_INVALID_ENGINE_PLAN",
      "yt-dlp requires a page or source URL",
    );

    expect(error.classification).toBe("terminal_for_site");
    expect(error.fallbackable).toBe(false);
  });

  it("classifies auth-required code as auth_required", () => {
    const error = new DownloadRuntimeError(
      "E_AUTH_REQUIRED",
      "Sign in to confirm you're not a bot",
    );

    expect(error.classification).toBe("auth_required");
    expect(error.fallbackable).toBe(false);
  });

  it("classifies execution failures as fallback-to-other-engine without parsing raw text", () => {
    // Raw CLI text must not influence the core classification; Infrastructure
    // classifies evidence and passes the explicit classification.
    const error = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "yt-dlp exited with code 1: request timed out while downloading webpage",
    );

    expect(error.classification).toBe("fallback_to_other_engine");
    expect(error.fallbackable).toBe(true);
  });

  it("records whether the classification was explicitly supplied", () => {
    const explicit = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "network 403 requires login",
      { classification: "fallback_to_other_engine" },
    );
    const derived = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "network 403 requires login",
    );

    expect(explicit.classificationExplicit).toBe(true);
    expect(derived.classificationExplicit).toBe(false);
    expect(derived.classification).toBe("fallback_to_other_engine");
  });

  it("honors an explicit classification supplied by infrastructure", () => {
    const authError = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "yt-dlp exited with code 1: cookies required",
      { classification: "auth_required" },
    );
    const retryError = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "gallery-dl exited with code 1: request timed out",
      { classification: "retry_same_engine" },
    );
    const cancelledError = new DownloadRuntimeError(
      "E_ABORTED",
      "Download cancelled",
      { classification: "cancelled" },
    );

    expect(authError.classification).toBe("auth_required");
    expect(authError.fallbackable).toBe(false);
    expect(retryError.classification).toBe("retry_same_engine");
    expect(retryError.fallbackable).toBe(false);
    expect(cancelledError.classification).toBe("cancelled");
    expect(cancelledError.fallbackable).toBe(false);
  });

  it("classifies missing engines and output-not-found as fallback-to-other-engine", () => {
    expect(new DownloadRuntimeError(
      "E_ENGINE_NOT_FOUND",
      "Engine not registered: yt-dlp",
    ).classification).toBe("fallback_to_other_engine");
    expect(new DownloadRuntimeError(
      "E_OUTPUT_NOT_FOUND",
      "yt-dlp exited successfully but produced no final output path",
    ).classification).toBe("fallback_to_other_engine");
  });

  it("classifies no-provider-match and invalid input as input_invalid", () => {
    expect(new DownloadRuntimeError(
      "E_NO_PROVIDER_MATCH",
      "No site provider matched the incoming download request",
    ).classification).toBe("input_invalid");
    expect(new DownloadRuntimeError(
      "E_INVALID_INTENT",
      "Invalid intent",
    ).classification).toBe("input_invalid");
  });
});
