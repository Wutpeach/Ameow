import { describe, expect, it } from "vitest";
import { parseYtDlpProgressLine } from "./ytDlpProgress";

describe("parseYtDlpProgressLine", () => {
  it("parses standard yt-dlp download lines", () => {
    const payload = parseYtDlpProgressLine(
      "trace-1",
      "[download]  37.5% of 12.34MiB at 1.23MiB/s ETA 00:12",
    );

    expect(payload).not.toBeNull();
    expect(payload?.traceId).toBe("trace-1");
    expect(payload?.percent).toBe(37.5);
    expect(payload?.stage).toBe("downloading");
    expect(payload?.speed).toBe("1.23MiB/s");
    expect(payload?.eta).toBe("00:12");
  });

  it("maps merge lines into merging stage", () => {
    const payload = parseYtDlpProgressLine(
      "trace-2",
      "[Merger] Merging formats into \"output.mp4\"",
    );

    expect(payload).not.toBeNull();
    expect(payload?.stage).toBe("merging");
    expect(payload?.percent).toBe(100);
    expect(payload?.speed).toBe("merging");
    expect(payload?.eta).toBe("");
  });

  it("maps metadata finalization lines into post-processing stage", () => {
    const payload = parseYtDlpProgressLine(
      "trace-3",
      "[Metadata] Embedding metadata in \"output.mp4\"",
    );

    expect(payload).not.toBeNull();
    expect(payload?.stage).toBe("post_processing");
    expect(payload?.percent).toBe(100);
  });

  it("maps cleanup finalization lines into post-processing stage", () => {
    const payload = parseYtDlpProgressLine(
      "trace-4",
      "Deleting original file output.f247.webm (pass -k to keep)",
    );

    expect(payload).not.toBeNull();
    expect(payload?.stage).toBe("post_processing");
    expect(payload?.percent).toBe(100);
  });

  it("maps section download start lines into downloading stage without a percent", () => {
    const payload = parseYtDlpProgressLine(
      "trace-section",
      "[download] Downloading section 1 of 1",
    );

    expect(payload).not.toBeNull();
    expect(payload?.traceId).toBe("trace-section");
    expect(payload?.stage).toBe("downloading");
    expect(payload?.percent).toBe(-1);
    expect(payload?.speed).toBe("Downloading media...");
  });

  it("derives clip progress from ffmpeg time output when clip duration is known", () => {
    const payload = parseYtDlpProgressLine(
      "trace-ffmpeg",
      "size=   2048kB time=00:00:05.00 bitrate=3355.4kbits/s speed=2.5x",
      { clipDurationSec: 20 },
    );

    expect(payload).not.toBeNull();
    expect(payload?.traceId).toBe("trace-ffmpeg");
    expect(payload?.stage).toBe("downloading");
    expect(payload?.percent).toBe(25);
    expect(payload?.speed).toBe("2.5x");
  });

  it("caps ffmpeg clip progress below complete until yt-dlp reports completion", () => {
    const payload = parseYtDlpProgressLine(
      "trace-ffmpeg-cap",
      "size=   8192kB time=00:01:30.00 bitrate=3355.4kbits/s speed=3x",
      { clipDurationSec: 20 },
    );

    expect(payload?.percent).toBe(99);
  });

  it("ignores non-progress noise", () => {
    expect(parseYtDlpProgressLine("trace-5", "WARNING: extractor failed")).toBeNull();
  });
});

