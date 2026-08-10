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
  // P3: the transport compatibility decoder maps the Extension
  // `extensionData.ameowCapture` container into the canonical
  // `captureEvidence` field; Sites must not read the Extension container shape.
  const captureEvidence = input.captureEvidence;
  if (!isRecord(captureEvidence) || captureEvidence.version !== 1) {
    return undefined;
  }

  return captureEvidence as AmeowCaptureEvidenceV1;
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
