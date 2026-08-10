/**
 * Minimal capability model. Only capabilities that genuinely distinguish
 * engines and can influence engine selection are declared here; provider
 * special cases stay expressible through explicit preferred/required engine
 * plans (they are never erased by capability filtering).
 *
 * Contract: `plan.requirements.advancedQuality` declares that this Site
 * request needs an engine able to execute a plan carrying an advanced-quality
 * selector; `DownloadEngine.capabilities.advancedQuality` means the engine
 * can execute such a plan. The advanced-quality *probe* itself is a yt-dlp
 * only Infrastructure feature and is never advertised as a capability port;
 * a capable engine that is not yt-dlp has nothing to probe.
 */
export type DownloadCapabilities = {
  /** Engine can execute a plan carrying an advanced-quality selector. */
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
