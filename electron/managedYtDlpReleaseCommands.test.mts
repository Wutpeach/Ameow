import { describe, expect, it, vi } from "vitest";

import { createManagedYtDlpReleaseCommandController } from "./managedYtDlpReleaseCommands.mjs";

describe("managed yt-dlp release commands", () => {
  it("exposes only pure inventory and releaseId-only staging", async () => {
    const inspect = vi.fn(async () => ({ selection: "bundled" }));
    const stage = vi.fn(async (releaseId: string) => ({ releaseId, stage: "committed", eligibility: { status: "passed" } }));
    const controller = createManagedYtDlpReleaseCommandController({ inspect, stage });

    expect(controller.supports("get_managed_ytdlp_releases")).toBe(true);
    expect(controller.supports("stage_managed_ytdlp_release")).toBe(true);
    await expect(controller.invoke("get_managed_ytdlp_releases")).resolves.toEqual({ selection: "bundled" });
    await expect(controller.invoke("stage_managed_ytdlp_release", { releaseId: "release-1" })).resolves.toMatchObject({ releaseId: "release-1" });
    await expect(controller.invoke("stage_managed_ytdlp_release", { releaseId: "release-1", url: "https://bad.example" }))
      .rejects.toThrow("releaseId only");
    expect(stage).toHaveBeenCalledWith("release-1");
  });
});
