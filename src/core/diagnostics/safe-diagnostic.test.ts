import { describe, expect, it } from "vitest";
import { sanitizeDiagnosticText, toSafeDiagnosticUrl } from "./safe-diagnostic.js";

describe("safe diagnostic representation", () => {
  it("reduces signed URLs to safe origin metadata", () => {
    expect(toSafeDiagnosticUrl(
      "https://user:pass@example.com/video/secret?id=1&token=SECRET#fragment",
    )).toEqual({
      origin: "https://example.com",
      hasQuery: true,
      hasFragment: true,
    });
    expect(sanitizeDiagnosticText(
      "failed https://example.com/video?id=1&token=SECRET&signature=sig#fragment",
    )).toBe("failed https://example.com");
  });

  it.each([
    ["Cookie: sid=secret", "Cookie: [REDACTED]"],
    ["Authorization: Bearer secret", "Authorization: [REDACTED]"],
    ["http://user:password@proxy.example.com:8080/path", "http://proxy.example.com:8080"],
    ["SESSION_TOKEN=secret-value", "SESSION_TOKEN=[REDACTED]"],
    ["HTTPS_PROXY=http://user:password@proxy.example.com", "HTTPS_PROXY=[REDACTED]"],
    ["cookie_file=C:\\Users\\Alice\\cookies.txt", "cookie_file=[REDACTED]"],
    ["output=/home/alice/private/video.mp4", "output=[REDACTED_PATH]"],
  ])("scrubs %s", (input, expected) => {
    expect(sanitizeDiagnosticText(input)).toBe(expected);
  });

  it("bounds diagnostic text", () => {
    expect(sanitizeDiagnosticText("x".repeat(20), 8)).toBe("xxxxxxx…");
  });
});
