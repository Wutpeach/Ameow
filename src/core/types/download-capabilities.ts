/**
 * Minimal capability model. Only capabilities that genuinely distinguish
 * engines and can influence engine selection are declared here; provider
 * special cases stay expressible through explicit preferred/required engine
 * plans (they are never erased by capability filtering).
 */
export type DownloadCapabilities = {
  /** Engine can serve advanced quality selection probing (yt-dlp only). */
  advancedQuality: boolean;
};

/** Plans declare only the subset of capabilities their content requires. */
export type DownloadCapabilityRequirements = Partial<DownloadCapabilities>;

export const capabilitiesSatisfy = (
  capabilities: DownloadCapabilities,
  requirements: DownloadCapabilityRequirements | undefined,
): boolean => {
  if (!requirements) {
    return true;
  }
  return (Object.keys(requirements) as Array<keyof DownloadCapabilities>)
    .every((key) => capabilities[key] === requirements[key]);
};
