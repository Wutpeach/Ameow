import { describe, expect, it } from "vitest";
import {
  classifyEngineDiagnosticCategory,
  classifyEngineFailure,
} from "./engineErrorClassifier.js";

describe("classifyEngineFailure", () => {
  it("classifies auth evidence as auth_required", () => {
    expect(classifyEngineFailure({
      message: "gallery-dl exited with code 1: cookies required for this resource",
    })).toBe("auth_required");
    expect(classifyEngineFailure({
      message: "HTTP 403",
    })).toBe("auth_required");
    expect(classifyEngineFailure({
      message: "Sign in to confirm you're not a bot",
    })).toBe("auth_required");
  });

  it("classifies transient evidence as retry_same_engine", () => {
    expect(classifyEngineFailure({
      message: "yt-dlp exited with code 1: request timed out while downloading webpage",
    })).toBe("retry_same_engine");
    expect(classifyEngineFailure({
      message: "rate limit exceeded (429)",
    })).toBe("retry_same_engine");
    expect(classifyEngineFailure({
      message: "connection reset by peer",
    })).toBe("retry_same_engine");
  });

  it("classifies generic extractor evidence as fallback_to_other_engine", () => {
    expect(classifyEngineFailure({
      message: "gallery-dl exited with code 1: extractor reported unsupported page",
    })).toBe("fallback_to_other_engine");
    expect(classifyEngineFailure({
      message: "unknown tool error",
    })).toBe("fallback_to_other_engine");
  });

  it("scans redacted evidence context (stderr tail) as well as the message", () => {
    expect(classifyEngineFailure({
      message: "yt-dlp exited with code 1",
      context: {
        stderrTail: ["ERROR: This video requires a login"],
      },
    })).toBe("auth_required");
    expect(classifyEngineFailure({
      message: "yt-dlp exited with code 1",
      context: {
        stderrTail: ["Connection timed out while fetching metadata"],
      },
    })).toBe("retry_same_engine");
  });

  it("reads a bare media-data 403 as an egress problem, not an auth wall", () => {
    const mediaDataForbidden = {
      message: "yt-dlp exited with code 1",
      context: {
        stderrTail: ["ERROR: unable to download video data: HTTP Error 403: Forbidden"],
      },
    };

    expect(classifyEngineFailure(mediaDataForbidden)).toBe("retry_same_engine");
    expect(classifyEngineDiagnosticCategory(mediaDataForbidden)).toBe("network");

    // A real auth wall in the same output still outranks the bare status code.
    const authWall = {
      message: "yt-dlp exited with code 1",
      context: {
        stderrTail: [
          "ERROR: unable to download video data: HTTP Error 403: Forbidden",
          "ERROR: Sign in to confirm you're not a bot",
        ],
      },
    };

    expect(classifyEngineFailure(authWall)).toBe("auth_required");
    expect(classifyEngineDiagnosticCategory(authWall)).toBe("authentication_required");
  });
});
