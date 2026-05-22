const COOKIE_HEADER_SEPARATORS = /[;\r\n]/;
const COOKIE_NAME_PATTERN = /^[^\s;=]+$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

export const sanitizeDouyinCookieRecord = (
  value: Record<string, unknown>,
): Record<string, string> => {
  const sanitized: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== "string") {
      continue;
    }
    const normalizedKey = key.trim();
    const normalizedValue = rawValue.trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    sanitized[normalizedKey] = normalizedValue;
  }
  return sanitized;
};

const parseDouyinCookiesFromNetscape = (raw: string): Record<string, string> => {
  const parsed: Record<string, string> = {};
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("#")) {
      continue;
    }
    const fields = line.split("\t");
    if (fields.length < 7) {
      continue;
    }
    const name = fields[5]?.trim();
    const value = fields[6]?.trim();
    if (!name || !value) {
      continue;
    }
    parsed[name] = value;
  }
  return parsed;
};

const parseDouyinCookiesFromHeader = (raw: string): Record<string, string> => {
  const parsed: Record<string, string> = {};
  const tokens = raw
    .split(COOKIE_HEADER_SEPARATORS)
    .map((token) => token.trim())
    .filter(Boolean);
  for (const token of tokens) {
    if (token.includes("\t")) {
      continue;
    }
    const separatorIndex = token.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = token.slice(0, separatorIndex).trim();
    const value = token.slice(separatorIndex + 1).trim();
    if (!COOKIE_NAME_PATTERN.test(name) || !value) {
      continue;
    }
    parsed[name] = value;
  }
  return parsed;
};

export const parseDouyinCookies = (
  raw: string | Record<string, unknown> | null | undefined,
): Record<string, string> => {
  if (!raw) {
    return {};
  }
  if (typeof raw === "string") {
    return {
      ...parseDouyinCookiesFromNetscape(raw),
      ...parseDouyinCookiesFromHeader(raw),
    };
  }
  if (!isPlainObject(raw)) {
    return {};
  }
  return sanitizeDouyinCookieRecord(raw);
};

export const mergeDouyinCookies = (
  ...sources: Array<Record<string, string> | null | undefined>
): Record<string, string> => {
  const merged: Record<string, string> = {};
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const [key, value] of Object.entries(source)) {
      const normalizedKey = key.trim();
      const normalizedValue = value.trim();
      if (!normalizedKey || !normalizedValue) {
        continue;
      }
      merged[normalizedKey] = normalizedValue;
    }
  }
  return merged;
};

export const buildDouyinCookieYamlLines = (
  cookies: Record<string, string>,
): string[] => {
  const entries = Object.entries(cookies)
    .filter(([key]) => COOKIE_NAME_PATTERN.test(key))
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return ["cookies: {}"];
  }
  return [
    "cookies:",
    ...entries.map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`),
  ];
};
