export type VideoQualityPreference = "best" | "balanced" | "data_saver";

export type NormalizedYtdlpQualityPreference = VideoQualityPreference;

export const normalizeVideoQualityPreference = (
  value: unknown,
): VideoQualityPreference | undefined => {
  switch (value) {
    case "best":
      return "best";
    case "balanced":
    case "high":
      return "balanced";
    case "data_saver":
    case "standard":
      return "data_saver";
    default:
      return undefined;
  }
};

export const normalizeYtdlpQualityPreference = normalizeVideoQualityPreference;

export const resolveYtdlpQualityPreferenceFromConfig = (
  config: Record<string, unknown>,
): VideoQualityPreference => (
  normalizeVideoQualityPreference(
    normalizeOptionalString(config.defaultVideoDownloadQuality)
      ?? normalizeOptionalString(config.ytdlpQualityPreference),
  ) ?? "best"
);

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};
