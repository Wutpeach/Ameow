import type { MediaCandidate } from "./media-candidate.js";
import type { AmeowCaptureEvidenceV1 } from "./extension-capture-evidence.js";

export type DownloadSelectionScope = "current_item" | "playlist";

export type YtdlpQualityPreference = "best" | "balanced" | "data_saver";

export type YouTubeExtensionData = {
  source?: "injected" | "pasted" | "context_menu";
};

export type DownloadExtensionData = Record<string, unknown> & {
  youtube?: YouTubeExtensionData;
  ameowCapture?: AmeowCaptureEvidenceV1;
};

export type RawDownloadInput = {
  url: string;
  pageUrl?: string;
  videoUrl?: string;
  selectedVideoVariant?: MediaCandidate;
  videoCandidates?: MediaCandidate[];
  title?: string;
  cookies?: string;
  selectionScope?: DownloadSelectionScope;
  clipStartSec?: number;
  clipEndSec?: number;
  videoQuality?: YtdlpQualityPreference;
  ytdlpQuality?: YtdlpQualityPreference;
  siteHint?: string;
  advancedQualityRequest?: boolean;
  advancedQualitySelector?: string;
  advancedQualityLabel?: string;
  extensionData?: DownloadExtensionData;
  diagnostics?: Record<string, unknown>;
};
