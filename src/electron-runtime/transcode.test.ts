import { describe, expect, it } from "vitest";
import {
  parseFfmpegProbeSummaryOutput,
  summarizeMediaProbe,
} from "./transcode.js";

describe("electron transcode helpers", () => {
  it("detects AE-safe mp4 h264+aac sources", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/sample.mp4",
      [
        "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:/Temp/sample.mp4':",
        "  Duration: 00:00:10.00, start: 0.000000, bitrate: 612 kb/s",
        "  Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080",
        "  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isAeSafe: true,
      plan: null,
    });
  });

  it("detects AE-safe mp4 h264 sources without audio", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/silent.mp4",
      [
        "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:/Temp/silent.mp4':",
        "  Duration: 00:00:10.00, start: 0.000000, bitrate: 512 kb/s",
        "  Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isAeSafe: true,
      plan: null,
    });
  });

  it("uses audio-only transcode for mp4 h264 sources with non-aac audio", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/opus-audio.mp4",
      [
        "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:/Temp/opus-audio.mp4':",
        "  Duration: 00:00:42.00, start: 0.000000, bitrate: 612 kb/s",
        "  Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080",
        "  Stream #0:1: Audio: opus, 48000 Hz, stereo, fltp, 160 kb/s",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isAeSafe: false,
      plan: "audio_transcode",
    });
  });

  it("uses remux-only when video is already h264/aac but the container is not mp4", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/archive.mkv",
      [
        "Input #0, matroska,webm, from 'C:/Temp/archive.mkv':",
        "  Duration: 00:02:15.50, start: 0.000000, bitrate: 712 kb/s",
        "  Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080",
        "  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isAeSafe: false,
      plan: "remux_only",
    });
  });

  it("uses full transcode for mp4 hevc sources", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/hevc.mp4",
      [
        "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:/Temp/hevc.mp4':",
        "  Duration: 00:01:03.00, start: 0.000000, bitrate: 2500 kb/s",
        "  Stream #0:0: Video: hevc (Main), yuv420p(tv), 3840x2160",
        "  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isAeSafe: false,
      plan: "full_transcode",
    });
  });

  it("uses full transcode when codecs are not AE-safe", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/archive.webm",
      [
        "Input #0, matroska,webm, from 'C:/Temp/archive.webm':",
        "  Duration: 00:03:48.00, start: 0.000000, bitrate: 1120 kb/s",
        "  Stream #0:0: Video: vp9, yuv420p(progressive), 1920x1080",
        "  Stream #0:1: Audio: opus, 48000 Hz, stereo, fltp, 160 kb/s",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isAeSafe: false,
      plan: "full_transcode",
    });
  });
});
