import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import type {
  ManagedYtDlpCandidateInspection,
  ManagedYtDlpStageResult,
} from "./managedYtDlpRelease.mjs";

export type ManagedYtDlpReleaseCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(command: AmeowRendererCommand, payload?: Record<string, unknown>): Promise<TResult>;
};

export type ManagedYtDlpReleaseCommandControllerOptions = {
  inspect(): Promise<ManagedYtDlpCandidateInspection>;
  stage(releaseId: string): Promise<ManagedYtDlpStageResult>;
};

const commands = new Set<AmeowRendererCommand>([
  "get_managed_ytdlp_releases",
  "stage_managed_ytdlp_release",
]);

const releaseIdFrom = (payload: Record<string, unknown> | undefined): string => {
  if (!payload || typeof payload.releaseId !== "string" || !payload.releaseId.trim()) {
    throw new Error("stage_managed_ytdlp_release requires an app-approved releaseId");
  }
  if (Object.keys(payload).some((key) => key !== "releaseId")) {
    throw new Error("stage_managed_ytdlp_release accepts releaseId only");
  }
  return payload.releaseId.trim();
};

export const createManagedYtDlpReleaseCommandController = (
  options: ManagedYtDlpReleaseCommandControllerOptions,
): ManagedYtDlpReleaseCommandController => ({
  supports(command: AmeowRendererCommand) {
    return commands.has(command);
  },
  async invoke<TResult>(command: AmeowRendererCommand, payload?: Record<string, unknown>) {
    switch (command) {
      case "get_managed_ytdlp_releases":
        return await options.inspect() as TResult;
      case "stage_managed_ytdlp_release":
        return await options.stage(releaseIdFrom(payload)) as TResult;
      default:
        throw new Error(`Unsupported managed yt-dlp release command: ${command}`);
    }
  },
});
