export type MediaCandidate = {
  url: string;
  type?: string;
  source?: string;
  confidence?: string;
  mediaType?: "video" | "image";
  label?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  qualityIndex?: number;
};
