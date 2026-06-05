const ACTIONABLE_ERROR_PATTERNS = [
  /\bERROR:/i,
  /\bHTTP Error\b/i,
  /\bRequested format is not available\b/i,
  /\bConversion failed\b/i,
  /\bInvalid\b/i,
  /\bFailed\b/i,
  /\bError\b/i,
  /\bffmpeg exited with code\b/i,
];

const TERMINAL_AVAILABILITY_PATTERNS = [
  /\bprivate video\b/i,
  /\bvideo unavailable\b/i,
  /\bthis video is unavailable\b/i,
  /\bnot available in your country\b/i,
  /\bHTTP Error 404\b/i,
  /\b404 Not Found\b/i,
];

const PROXY_GUIDANCE_PATTERNS = [
  /\bRequested format is not available\b/i,
  /\bHTTP Error\b/i,
  /\bERR_CONNECTION/i,
  /\bConnection (?:closed|reset|refused|timed out)\b/i,
  /\bffmpeg exited with code\b/i,
  /\bUnable to download\b/i,
  /\bFailed to download\b/i,
];

const YOUTUBE_PROXY_GUIDANCE =
  "If you are using a proxy tool for YouTube or GitHub access, enable TUN/global/VPN mode so Ameow, yt-dlp, and ffmpeg all use the same network route.";

const GENERIC_FFMPEG_NOISE_PATTERNS = [
  /^Press \[q\] to stop, \[\?\] for help$/i,
  /^handler_name\s*:/i,
  /^vendor_id\s*:/i,
  /^major_brand\s*:/i,
  /^minor_version\s*:/i,
  /^compatible_brands\s*:/i,
  /^encoder\s*:/i,
  /^Metadata:$/i,
  /^Stream #/i,
  /^Input #/i,
  /^Output #/i,
];

const UNSIGNED_32BIT_MIN = 2_147_483_648;
const UNSIGNED_32BIT_MAX = 4_294_967_295;

const normalizeLine = (line: string): string => line.trim();

const isGenericNoiseLine = (line: string): boolean => (
  GENERIC_FFMPEG_NOISE_PATTERNS.some((pattern) => pattern.test(line))
);

const isActionableLine = (line: string): boolean => (
  ACTIONABLE_ERROR_PATTERNS.some((pattern) => pattern.test(line))
);

const lastItem = <T>(values: T[]): T | undefined => values[values.length - 1];

export const annotateUnsignedWindowsExitCodes = (message: string): string => (
  message.replace(/\b(?:code|exit)\s+(\d{10})\b/gi, (match, rawCode: string) => {
    const code = Number(rawCode);
    if (!Number.isInteger(code) || code < UNSIGNED_32BIT_MIN || code > UNSIGNED_32BIT_MAX) {
      return match;
    }
    return `${match} (${code - (UNSIGNED_32BIT_MAX + 1)})`;
  })
);

export const summarizeYtDlpFailure = (
  stderrLines: string[],
  fallbackMessage: string,
  options: { isYouTube?: boolean } = {},
): string => {
  const normalized = stderrLines
    .map(normalizeLine)
    .filter(Boolean);

  const actionable = normalized.filter((line) => isActionableLine(line));
  const useful = normalized.filter((line) => !isGenericNoiseLine(line));
  const selected = lastItem(actionable) ?? lastItem(useful) ?? fallbackMessage;
  const summary = annotateUnsignedWindowsExitCodes(selected);
  if (
    options.isYouTube
    && normalized.some((line) => PROXY_GUIDANCE_PATTERNS.some((pattern) => pattern.test(line)))
  ) {
    return `${summary}\n${YOUTUBE_PROXY_GUIDANCE}`;
  }
  return summary;
};

export const hasTerminalYtDlpAvailabilityFailure = (stderrLines: string[]): boolean => (
  stderrLines.some((line) => TERMINAL_AVAILABILITY_PATTERNS.some((pattern) => pattern.test(line)))
);
