import type {
  AmeowCaptureEvidenceV1,
  RawDownloadInput,
} from "../core/index.js";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === "object" && !Array.isArray(value))
);

export const readAmeowCaptureEvidence = (
  input: RawDownloadInput,
): AmeowCaptureEvidenceV1 | undefined => {
  const ameowCapture = input.extensionData?.ameowCapture;
  if (!isRecord(ameowCapture) || ameowCapture.version !== 1) {
    return undefined;
  }

  return ameowCapture as AmeowCaptureEvidenceV1;
};

export const readCaptureContentId = (
  input: RawDownloadInput,
  key: string,
  pattern?: RegExp,
): string | undefined => {
  const contentIds = readAmeowCaptureEvidence(input)?.contentIds;
  const value = contentIds?.[key];
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || (pattern && !pattern.test(trimmed))) {
    return undefined;
  }
  return trimmed;
};
