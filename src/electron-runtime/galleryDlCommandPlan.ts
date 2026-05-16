import type { EngineExecutionContext } from "../core/index.js";
import { InvalidCommandPlanError } from "./commandPlanErrors.js";
import { getCliEngineManifest } from "./engineManifest.js";

export type GalleryDlCommandPlan = {
  sourceUrl: string;
  outputFilePrefix: string;
  args: string[];
};

export const isGalleryDlSidecar = (entryPath: string, outputStem: string): boolean => {
  const manifest = getCliEngineManifest("gallery-dl");
  return entryPath.startsWith(outputStem)
    && manifest.sidecarExtensions.some((extension) => (
      entryPath.toLowerCase().endsWith(`.${extension}`)
    ));
};

export const createGalleryDlCommandPlan = (
  context: EngineExecutionContext,
): GalleryDlCommandPlan => {
  const manifest = getCliEngineManifest("gallery-dl");
  const sourceUrl = context.enginePlan.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl;
  if (!sourceUrl) {
    throw new InvalidCommandPlanError("gallery-dl source URL is missing");
  }

  return {
    sourceUrl,
    outputFilePrefix: `${context.outputStem}.`,
    args: [
      ...manifest.configIsolationArgs,
      ...manifest.baseArgs,
      manifest.outputArgs.directoryFlag,
      context.outputDir,
      manifest.outputArgs.filenameFlag,
      `${context.outputStem}.${manifest.outputArgs.extensionTemplate}`,
      sourceUrl,
    ],
  };
};
