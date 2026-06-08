import type { RawDownloadInput } from "../core/index.js";
import { readAmeowCaptureEvidence } from "./extension-capture.js";

type CaptureSourceResolutionOptions = {
  isAcceptedSource(value: string | undefined): boolean;
  synthesizeSource?(input: RawDownloadInput): string | undefined;
  fallback?(input: RawDownloadInput): string;
};

export const isHttpSourceCandidate = (value: string | undefined): value is string => {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const collectCaptureSourceCandidates = (input: RawDownloadInput): string[] => {
  const capture = readAmeowCaptureEvidence(input);
  return [
    capture?.canonicalUrl,
    capture?.ogUrl,
    capture?.targetHref,
    capture?.targetSrc,
    ...(capture?.structuredDataUrls ?? []),
    input.url,
    input.pageUrl,
  ].filter(isHttpSourceCandidate);
};

export const resolveCaptureSourceUrl = (
  input: RawDownloadInput,
  options: CaptureSourceResolutionOptions,
): string => {
  const candidates = collectCaptureSourceCandidates(input);
  const acceptedSource = candidates.find(options.isAcceptedSource);
  if (acceptedSource) {
    return acceptedSource;
  }

  const synthesizedSource = options.synthesizeSource?.(input);
  if (isHttpSourceCandidate(synthesizedSource) && options.isAcceptedSource(synthesizedSource)) {
    return synthesizedSource;
  }

  return options.fallback?.(input) ?? input.pageUrl ?? input.url;
};
