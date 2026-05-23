export type AmeowCaptureAction =
  | "current_content"
  | "pick_download"
  | "popup_fallback";

export type AmeowCaptureEvidenceV1 = {
  version: 1;
  action: AmeowCaptureAction;
  pageUrl: string;
  canonicalUrl?: string;
  ogUrl?: string;
  title?: string;
  contentIds?: Record<string, string>;
  structuredDataUrls?: string[];
  targetHref?: string;
  targetSrc?: string;
};
