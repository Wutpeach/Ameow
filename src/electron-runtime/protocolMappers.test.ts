import { describe, expect, it } from "vitest";
import {
  toDownloadProgressPayload,
  toDownloadResultPayload,
} from "./protocolMappers.js";

describe("protocol mappers", () => {
  it("maps core DownloadResult to the protocol payload with stable keys", () => {
    expect(toDownloadResultPayload({
      traceId: "trace-1",
      success: true,
      filePath: "D:/downloads/video.mp4",
      title: "Sample Video",
    })).toEqual({
      traceId: "trace-1",
      success: true,
      file_path: "D:/downloads/video.mp4",
      title: "Sample Video",
      error: undefined,
    });
  });

  it("preserves failure results without file_path", () => {
    expect(toDownloadResultPayload({
      traceId: "trace-2",
      success: false,
      error: "boom",
    })).toEqual({
      traceId: "trace-2",
      success: false,
      file_path: undefined,
      title: undefined,
      error: "boom",
    });
  });

  it("maps core progress to the protocol payload preserving stage tokens", () => {
    expect(toDownloadProgressPayload({
      traceId: "trace-3",
      percent: 42,
      stage: "downloading",
      speed: "activity:galleryDl.savingFile",
      eta: "1:00",
    })).toEqual({
      traceId: "trace-3",
      percent: 42,
      stage: "downloading",
      speed: "activity:galleryDl.savingFile",
      eta: "1:00",
    });
  });
});
