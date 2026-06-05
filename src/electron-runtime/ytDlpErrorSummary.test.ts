import { describe, expect, it } from "vitest";
import {
  annotateUnsignedWindowsExitCodes,
  hasTerminalYtDlpAvailabilityFailure,
  summarizeYtDlpFailure,
} from "./ytDlpErrorSummary.js";

describe("yt-dlp error summaries", () => {
  it("prefers actionable error lines over trailing ffmpeg console noise", () => {
    expect(summarizeYtDlpFailure([
      "handler_name    : ISO Media file produced by Google Inc.",
      "ERROR: ffmpeg exited with code 4294967158",
      "vendor_id       : [0][0][0][0]",
      "Press [q] to stop, [?] for help",
    ], "yt-dlp exited with code 1")).toBe("ERROR: ffmpeg exited with code 4294967158 (-138)");
  });

  it("falls back when stderr contains only generic ffmpeg noise", () => {
    expect(summarizeYtDlpFailure([
      "handler_name    : ISO Media file produced by Google Inc.",
      "vendor_id       : [0][0][0][0]",
      "Press [q] to stop, [?] for help",
    ], "yt-dlp exited with code 1")).toBe("yt-dlp exited with code 1");
  });

  it("adds proxy-tool guidance to YouTube network-like failures", () => {
    expect(summarizeYtDlpFailure([
      "ERROR: [youtube] abc: Requested format is not available",
    ], "yt-dlp exited with code 1", { isYouTube: true })).toContain(
      "enable TUN/global/VPN mode",
    );
  });

  it("does not add proxy-tool guidance to non-YouTube failures", () => {
    expect(summarizeYtDlpFailure([
      "ERROR: ffmpeg exited with code 4294967158",
    ], "yt-dlp exited with code 1")).not.toContain("TUN/global/VPN");
  });

  it("annotates unsigned Windows ffmpeg exit codes", () => {
    expect(annotateUnsignedWindowsExitCodes("ffmpeg exited with code 4294967158"))
      .toBe("ffmpeg exited with code 4294967158 (-138)");
  });

  it("detects terminal page availability failures", () => {
    expect(hasTerminalYtDlpAvailabilityFailure(["ERROR: [youtube] abc: Private video"])).toBe(true);
    expect(hasTerminalYtDlpAvailabilityFailure(["ERROR: ffmpeg exited with code 4294967158"])).toBe(false);
  });
});
