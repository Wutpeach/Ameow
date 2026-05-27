import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createJsonlDownloadTelemetrySink } from "./downloadTelemetry.js";

const tempDirs: string[] = [];

describe("download telemetry sink", () => {
  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("appends validated telemetry events as JSONL", async () => {
    const tempDir = path.join(os.tmpdir(), `ameow-telemetry-${Date.now()}`);
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "telemetry", "download-outcomes.jsonl");
    const sink = createJsonlDownloadTelemetrySink(filePath);

    await sink.record({
      schemaVersion: 1,
      eventType: "download_outcome",
      recordedAt: new Date().toISOString(),
      traceId: "trace-1",
      siteId: "youtube",
      providerId: "youtube",
      interactionMode: "paste",
      engineChain: ["yt-dlp"],
      chosenEngine: "yt-dlp",
      outcome: "success",
      errorCode: null,
      errorClassification: null,
      errorMessage: null,
      downloadProfile: {
        qualityPreference: "balanced",
        ytdlpProfileKey: "default",
        ytdlpMergeOutputFormat: "mp4",
        ytdlpFormatSort: "ext:mp4:m4a",
      },
      compatibility: {
        sourceExtension: "mp4",
        containerNames: ["mov", "mp4"],
        videoCodec: "h264",
        audioCodec: "aac",
        decision: "skip_compatible",
        probeFailed: false,
        probeErrorSummary: null,
      },
    });

    await sink.record({
      schemaVersion: 1,
      eventType: "download_outcome",
      recordedAt: new Date().toISOString(),
      traceId: "trace-2",
      siteId: "weibo",
      providerId: "weibo",
      interactionMode: "context_menu",
      engineChain: ["gallery-dl", "yt-dlp"],
      chosenEngine: null,
      outcome: "failure",
      errorCode: "E_EXECUTION_FAILED",
      errorClassification: "auth_required",
      errorMessage: "cookies required",
    });

    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({
      traceId: "trace-1",
      outcome: "success",
      downloadProfile: {
        qualityPreference: "balanced",
        ytdlpMergeOutputFormat: "mp4",
      },
      compatibility: {
        decision: "skip_compatible",
        videoCodec: "h264",
      },
    });
    expect(JSON.parse(lines[1])).toMatchObject({
      traceId: "trace-2",
      errorClassification: "auth_required",
    });
  });
});
