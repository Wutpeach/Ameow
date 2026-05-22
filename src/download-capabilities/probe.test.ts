import { describe, expect, it } from "vitest";
import {
  buildGalleryDlProbeArgs,
  buildYtDlpProbeArgs,
  capabilityProbeResultSchema,
  runGalleryDlProbe,
  runYtDlpProbe,
} from "./probe.js";

describe("capability probe helpers", () => {
  it("builds yt-dlp probe args that avoid a real download", () => {
    expect(buildYtDlpProbeArgs("https://example.com/watch/42")).toEqual([
      "--simulate",
      "--skip-download",
      "--dump-single-json",
      "--no-warnings",
      "--ignore-config",
      "https://example.com/watch/42",
    ]);
  });

  it("builds gallery-dl probe args that stay in simulate mode", () => {
    expect(buildGalleryDlProbeArgs("https://example.com/post/42")).toEqual([
      "--simulate",
      "--verbose",
      "https://example.com/post/42",
    ]);
  });

  it("maps successful yt-dlp probes to works status", async () => {
    const result = await runYtDlpProbe(
      {
        binaryPath: "/tmp/yt-dlp",
        sourceUrl: "https://example.com/watch/42",
        siteId: "generic",
      },
      async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          extractor_key: "Generic",
          title: "Example",
        }),
        stderr: "",
      }),
    );

    expect(capabilityProbeResultSchema.parse(result)).toMatchObject({
      engine: "yt-dlp",
      status: "works",
      authRequirement: "optional",
      extractorId: "Generic",
    });
  });

  it("maps auth-gated yt-dlp probe failures to works_with_auth", async () => {
    const result = await runYtDlpProbe(
      {
        binaryPath: "/tmp/yt-dlp",
        sourceUrl: "https://example.com/watch/42",
      },
      async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "ERROR: Sign in to confirm you're not a bot (cookies required)",
      }),
    );

    expect(capabilityProbeResultSchema.parse(result)).toMatchObject({
      status: "works_with_auth",
      classification: "auth_required",
      authRequirement: "required",
    });
  });

  it("maps transient gallery-dl failures to unstable", async () => {
    const result = await runGalleryDlProbe(
      {
        binaryPath: "/tmp/gallery-dl",
        sourceUrl: "https://example.com/post/42",
      },
      async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "[gallery-dl][error] Request timed out while fetching metadata",
      }),
    );

    expect(capabilityProbeResultSchema.parse(result)).toMatchObject({
      engine: "gallery-dl",
      status: "unstable",
      classification: "retry_same_engine",
    });
  });

});
