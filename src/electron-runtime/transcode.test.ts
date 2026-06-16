import { describe, expect, it } from "vitest";
import {
  createProbeFailureVideoCompatibilityAnalysis,
  createVideoCompatibilityAnalysis,
  parseFfmpegProbeSummaryOutput,
  summarizeMediaProbe,
} from "./transcode.js";

describe("electron transcode helpers", () => {
  it("detects editing-compatible mp4 h264+aac sources", () => {
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
      isEditingCompatible: true,
      plan: null,
    });
    expect(createVideoCompatibilityAnalysis("C:/Temp/sample.mp4", summary)).toEqual({
      sourceExtension: "mp4",
      containerNames: ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"],
      videoCodec: "h264",
      audioCodec: "aac",
      decision: "skip_compatible",
      probeFailed: false,
      probeErrorSummary: null,
    });
  });

  it("detects editing-compatible mp4 h264 sources without audio", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/silent.mp4",
      [
        "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:/Temp/silent.mp4':",
        "  Duration: 00:00:10.00, start: 0.000000, bitrate: 512 kb/s",
        "  Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isEditingCompatible: true,
      plan: null,
    });
    expect(createVideoCompatibilityAnalysis("C:/Temp/silent.mp4", summary)).toEqual({
      sourceExtension: "mp4",
      containerNames: ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"],
      videoCodec: "h264",
      audioCodec: null,
      decision: "skip_compatible",
      probeFailed: false,
      probeErrorSummary: null,
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
      isEditingCompatible: false,
      plan: "audio_transcode",
    });
    expect(createVideoCompatibilityAnalysis("C:/Temp/opus-audio.mp4", summary)).toMatchObject({
      sourceExtension: "mp4",
      videoCodec: "h264",
      audioCodec: "opus",
      decision: "audio_transcode",
      probeFailed: false,
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
      isEditingCompatible: false,
      plan: "remux_only",
    });
    expect(createVideoCompatibilityAnalysis("C:/Temp/archive.mkv", summary)).toMatchObject({
      sourceExtension: "mkv",
      containerNames: ["matroska", "webm"],
      videoCodec: "h264",
      audioCodec: "aac",
      decision: "remux_only",
      probeFailed: false,
    });
  });

  it("detects editing-compatible mp4 hevc+aac sources", () => {
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
      isEditingCompatible: true,
      plan: null,
    });
    expect(createVideoCompatibilityAnalysis("C:/Temp/hevc.mp4", summary)).toMatchObject({
      sourceExtension: "mp4",
      videoCodec: "hevc",
      audioCodec: "aac",
      decision: "skip_compatible",
      probeFailed: false,
    });
  });

  it("detects editing-compatible mov hevc+aac sources", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/hevc.mov",
      [
        "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:/Temp/hevc.mov':",
        "  Duration: 00:01:03.00, start: 0.000000, bitrate: 2500 kb/s",
        "  Stream #0:0: Video: hevc (Main), yuv420p(tv), 3840x2160",
        "  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isEditingCompatible: true,
      plan: null,
    });
    expect(createVideoCompatibilityAnalysis("C:/Temp/hevc.mov", summary)).toMatchObject({
      sourceExtension: "mov",
      videoCodec: "hevc",
      audioCodec: "aac",
      decision: "skip_compatible",
      probeFailed: false,
    });
  });

  it("uses remux-only when hevc+aac is compatible but the container is not mp4 or mov", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/hevc.mkv",
      [
        "Input #0, matroska,webm, from 'C:/Temp/hevc.mkv':",
        "  Duration: 00:01:03.00, start: 0.000000, bitrate: 2500 kb/s",
        "  Stream #0:0: Video: hevc (Main), yuv420p(tv), 3840x2160",
        "  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isEditingCompatible: false,
      plan: "remux_only",
    });
    expect(createVideoCompatibilityAnalysis("C:/Temp/hevc.mkv", summary)).toMatchObject({
      sourceExtension: "mkv",
      videoCodec: "hevc",
      audioCodec: "aac",
      decision: "remux_only",
      probeFailed: false,
    });
  });

  it("uses full transcode when codecs are not editing-compatible", () => {
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
      isEditingCompatible: false,
      plan: "full_transcode",
    });
  });

  it("summarizes probe failure as conservative full-transcode telemetry", () => {
    const analysis = createProbeFailureVideoCompatibilityAnalysis(
      "C:/Temp/broken.mp4",
      new Error("ffprobe failed with an extremely long diagnostic ".repeat(20)),
    );

    expect(analysis).toEqual({
      sourceExtension: "mp4",
      containerNames: [],
      videoCodec: null,
      audioCodec: null,
      decision: "probe_failure_full_transcode",
      probeFailed: true,
      probeErrorSummary: expect.stringMatching(/^ffprobe failed/),
    });
    expect(analysis.probeErrorSummary?.length).toBeLessThanOrEqual(240);
  });
});
