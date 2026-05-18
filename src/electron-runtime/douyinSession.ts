import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DouyinSessionSummary } from "../types/douyinSession.js";

const REQUIRED_COOKIE_KEYS = [
  "ttwid",
  "odin_tt",
  "passport_csrf_token",
] as const;

const LOGIN_COOKIE_KEYS = [
  "sessionid",
  "sid_tt",
  "sid_guard",
] as const;

const COOKIE_HEADER_SEPARATORS = /[;\r\n]/;

export type DouyinSessionPaths = {
  rootDir: string;
  configPath: string;
  cookiesPath: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

export const resolveDouyinSessionPaths = (configDir: string): DouyinSessionPaths => {
  const rootDir = path.join(configDir, "sessions", "douyin");
  return {
    rootDir,
    configPath: path.join(rootDir, "config.yml"),
    cookiesPath: path.join(rootDir, "cookies.json"),
  };
};

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
    const separatorIndex = token.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = token.slice(0, separatorIndex).trim();
    const value = token.slice(separatorIndex + 1).trim();
    if (!name || !value) {
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

export const readDouyinSessionCookies = async (
  configDir: string,
): Promise<Record<string, string>> => {
  const { cookiesPath } = resolveDouyinSessionPaths(configDir);
  try {
    const raw = await readFile(cookiesPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) {
      return {};
    }
    return sanitizeDouyinCookieRecord(parsed);
  } catch {
    return {};
  }
};

export const writeDouyinSessionCookies = async (
  configDir: string,
  cookies: Record<string, string>,
): Promise<void> => {
  const { rootDir, cookiesPath } = resolveDouyinSessionPaths(configDir);
  await mkdir(rootDir, { recursive: true });
  await writeFile(
    cookiesPath,
    `${JSON.stringify(mergeDouyinCookies(cookies), null, 2)}\n`,
    "utf8",
  );
};

export const clearDouyinSessionArtifacts = async (configDir: string): Promise<void> => {
  const { rootDir } = resolveDouyinSessionPaths(configDir);
  await rm(rootDir, { recursive: true, force: true }).catch(() => undefined);
};

export const buildDouyinCookieYamlLines = (
  cookies: Record<string, string>,
): string[] => {
  const entries = Object.entries(cookies).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return ["cookies: {}"];
  }
  return [
    "cookies:",
    ...entries.map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`),
  ];
};

export const readDouyinSessionStatus = async (
  configDir: string,
): Promise<DouyinSessionSummary> => {
  const cookies = await readDouyinSessionCookies(configDir);
  const { cookiesPath } = resolveDouyinSessionPaths(configDir);
  const cookieCount = Object.keys(cookies).length;
  const missingKeys = REQUIRED_COOKIE_KEYS.filter((key) => !cookies[key]);
  const hasLoginCookie = LOGIN_COOKIE_KEYS.some((key) => Boolean(cookies[key]));
  const lastUpdatedAtMs = await stat(cookiesPath)
    .then((result) => (Number.isFinite(result.mtimeMs) ? Math.round(result.mtimeMs) : null))
    .catch(() => null);

  return {
    state: cookieCount > 0 && missingKeys.length === 0 && hasLoginCookie ? "ready" : "missing",
    lastUpdatedAtMs,
    cookieCount,
    missingKeys,
    hasLoginCookie,
  };
};
