export type SafeDiagnosticUrl = {
  origin: string;
  hasQuery: boolean;
  hasFragment: boolean;
};

const REDACTED = "[REDACTED]";
const REDACTED_PATH = "[REDACTED_PATH]";
const URL_PATTERN = /\b(?:https?|socks4|socks5):\/\/[^\s"'<>]+/gi;
const FILE_PATH_PATTERN = /(?:\b[A-Za-z]:\\[^\s"'<>|]+|\/(?:Users|home|private|tmp|var|etc)\/[^\s"'<>]+)/g;

export const toSafeDiagnosticUrl = (
  value: string | null | undefined,
): SafeDiagnosticUrl | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if (!parsed.hostname || !["http:", "https:"].includes(parsed.protocol)) {
      return undefined;
    }
    return {
      origin: `${parsed.protocol}//${parsed.host}`,
      hasQuery: Boolean(parsed.search),
      hasFragment: Boolean(parsed.hash),
    };
  } catch {
    return undefined;
  }
};

const safeUrlText = (value: string): string => {
  try {
    const parsed = new URL(value);
    return parsed.hostname ? `${parsed.protocol}//${parsed.host}` : REDACTED;
  } catch {
    return REDACTED;
  }
};

/**
 * Shared persistence/copy/log scrub boundary. It is deliberately small: URL
 * diagnostics collapse to origin, secret value positions are removed, local
 * paths are hidden, and output is bounded. Correctness code must never consume
 * this text; it is a diagnostic representation only.
 */
export const sanitizeDiagnosticText = (
  value: string,
  maxLength = 480,
): string => {
  const scrubbed = value
    .replace(URL_PATTERN, safeUrlText)
    .replace(/\b(Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi, `$1: ${REDACTED}`)
    .replace(/\b(Authorization|Proxy-Authorization)\s*:\s*[^\r\n]+/gi, `$1: ${REDACTED}`)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
    .replace(
      /\b([A-Za-z0-9_-]*(?:cookie|authorization|token|secret|password|passwd|session|api[_-]?key|proxy)[A-Za-z0-9_-]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;}&]+)/gi,
      (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`,
    )
    .replace(FILE_PATH_PATTERN, REDACTED_PATH);
  if (scrubbed.length <= maxLength) {
    return scrubbed;
  }
  return `${scrubbed.slice(0, Math.max(0, maxLength - 1))}…`;
};
