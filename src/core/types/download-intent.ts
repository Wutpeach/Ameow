import type { MediaCandidate } from "./media-candidate.js";
import type { DownloadSelectionScope } from "./raw-download-input.js";
import type { VideoQualityPreference } from "../download-preferences.js";

type BaseIntent = {
  siteId: string;
  originalUrl: string;
  pageUrl?: string;
  title?: string;
  priority: number;
  candidates: MediaCandidate[];
  selectedVideoVariant?: MediaCandidate;
  selectionScope?: DownloadSelectionScope;
  videoQuality?: VideoQualityPreference;
};

export type VideoDownloadIntent = BaseIntent & {
  type: "video";
  preferredFormat: "mp4" | "webm" | "best";
  clipStartSec?: number;
  clipEndSec?: number;
};

export type ImageDownloadIntent = BaseIntent & {
  type: "image";
  saveAsAlbum?: boolean;
};

export type SegmentDownloadIntent = BaseIntent & {
  type: "segment";
  startTime: number;
  endTime: number;
};

export type BatchDownloadIntent = BaseIntent & {
  type: "batch";
  itemCountHint?: number;
};

export type DownloadIntent =
  | VideoDownloadIntent
  | ImageDownloadIntent
  | SegmentDownloadIntent
  | BatchDownloadIntent;
