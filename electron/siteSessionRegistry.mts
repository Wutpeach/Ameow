import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  createSeedSiteSessionRegistryEntries,
} from "../src/site-session-registry.js";
import type { SiteSessionRegistryEntry } from "../src/types/siteSession.js";

type StoredSiteSessionRegistry = {
  version: 1;
  entries: SiteSessionRegistryEntry[];
};

export type SiteSessionRegistry = {
  listVisibleEntries(): SiteSessionRegistryEntry[];
  getEntry(siteId: string): SiteSessionRegistryEntry | null;
  requireEntry(siteId: string): SiteSessionRegistryEntry;
};

export type SiteSessionRegistryOptions = {
  getUserDataDir(): string;
  now?(): number;
};

const REGISTRY_VERSION = 1;

const defaultNow = (): number => Date.now();

const registryFilePath = (userDataDir: string): string => (
  join(userDataDir, "site-sessions", "registry.json")
);

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map(normalizeString).filter((item): item is string => item !== null)
    : []
);

const normalizeEntry = (value: unknown): SiteSessionRegistryEntry | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const siteId = normalizeString(record.siteId);
  const displayName = normalizeString(record.displayName);
  const primaryUrl = normalizeString(record.primaryUrl);
  const primaryHost = normalizeString(record.primaryHost);
  const cookieDomains = normalizeStringArray(record.cookieDomains);
  if (!siteId || !displayName || !primaryUrl || !primaryHost || cookieDomains.length === 0) {
    return null;
  }

  return {
    siteId,
    displayName,
    labelKey: normalizeString(record.labelKey) ?? undefined,
    primaryUrl,
    primaryHost,
    cookieDomains,
    requiredCookieKeys: normalizeStringArray(record.requiredCookieKeys),
    loginCookieKeys: normalizeStringArray(record.loginCookieKeys),
    syncAuthorization: record.syncAuthorization === "user_enabled" || record.syncAuthorization === "auto_discovered"
      ? record.syncAuthorization
      : "seeded",
    autoSyncAllowed: record.autoSyncAllowed === true,
    discoverySources: normalizeStringArray(record.discoverySources)
      .filter((source): source is SiteSessionRegistryEntry["discoverySources"][number] => (
        source === "seed"
        || source === "gallery-dl-supported-sites"
        || source === "auth_required"
        || source === "extension_current_tab"
        || source === "user_sync"
      )),
    engineHints: normalizeStringArray(record.engineHints)
      .filter((engine): engine is SiteSessionRegistryEntry["engineHints"][number] => (
        engine === "yt-dlp" || engine === "gallery-dl" || engine === "douyin-dl"
      )),
    visibility: record.visibility === "hidden_catalog" ? "hidden_catalog" : "visible",
    icon: {
      kind: (
        record.icon
        && typeof record.icon === "object"
        && !Array.isArray(record.icon)
        && ((record.icon as Record<string, unknown>).kind === "known"
          || (record.icon as Record<string, unknown>).kind === "favicon")
      )
        ? (record.icon as { kind: "known" | "favicon" }).kind
        : "placeholder",
      key: normalizeString((record.icon as Record<string, unknown> | undefined)?.key) ?? undefined,
      url: normalizeString((record.icon as Record<string, unknown> | undefined)?.url) ?? undefined,
      localPath: normalizeString((record.icon as Record<string, unknown> | undefined)?.localPath) ?? undefined,
    },
    createdAtMs: Number(record.createdAtMs) || 0,
    updatedAtMs: Number(record.updatedAtMs) || 0,
  };
};

const mergeSeedEntries = (
  storedEntries: SiteSessionRegistryEntry[],
  seedEntries: SiteSessionRegistryEntry[],
): SiteSessionRegistryEntry[] => {
  const entries = new Map<string, SiteSessionRegistryEntry>();
  for (const entry of storedEntries) {
    entries.set(entry.siteId, entry);
  }
  for (const seed of seedEntries) {
    const existing = entries.get(seed.siteId);
    entries.set(seed.siteId, existing
      ? {
          ...seed,
          ...existing,
          labelKey: seed.labelKey ?? existing.labelKey,
          cookieDomains: seed.cookieDomains,
          requiredCookieKeys: seed.requiredCookieKeys,
          loginCookieKeys: seed.loginCookieKeys,
          syncAuthorization: "seeded",
          autoSyncAllowed: true,
          discoverySources: Array.from(new Set(["seed", ...existing.discoverySources])),
          visibility: "visible",
          icon: existing.icon.kind === "placeholder" ? seed.icon : existing.icon,
          updatedAtMs: Math.max(existing.updatedAtMs, seed.updatedAtMs),
        }
      : seed);
  }
  return Array.from(entries.values()).sort((left, right) => (
    left.displayName.localeCompare(right.displayName)
  ));
};

export const createSiteSessionRegistry = (
  options: SiteSessionRegistryOptions,
): SiteSessionRegistry => {
  const now = options.now ?? defaultNow;
  const filePath = registryFilePath(options.getUserDataDir());
  const seedEntries = createSeedSiteSessionRegistryEntries(now());
  let entries: SiteSessionRegistryEntry[] | null = null;

  const loadEntries = (): SiteSessionRegistryEntry[] => {
    if (entries) {
      return entries;
    }

    let storedEntries: SiteSessionRegistryEntry[] = [];
    if (existsSync(filePath)) {
      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const rawEntries = (parsed as Partial<StoredSiteSessionRegistry>).entries;
          storedEntries = Array.isArray(rawEntries)
            ? rawEntries.map(normalizeEntry).filter((entry): entry is SiteSessionRegistryEntry => entry !== null)
            : [];
        }
      } catch {
        storedEntries = [];
      }
    }

    entries = mergeSeedEntries(storedEntries, seedEntries);
    persistEntries(entries);
    return entries;
  };

  const persistEntries = (nextEntries: SiteSessionRegistryEntry[]): void => {
    const payload: StoredSiteSessionRegistry = {
      version: REGISTRY_VERSION,
      entries: nextEntries,
    };
    mkdirSync(dirname(filePath), { recursive: true });
    const tempFilePath = `${filePath}.tmp`;
    writeFileSync(tempFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    renameSync(tempFilePath, filePath);
  };

  return {
    listVisibleEntries() {
      return loadEntries().filter((entry) => entry.visibility === "visible");
    },
    getEntry(siteId) {
      return loadEntries().find((entry) => entry.siteId === siteId) ?? null;
    },
    requireEntry(siteId) {
      const entry = this.getEntry(siteId);
      if (!entry) {
        throw new Error(`Unsupported site session: ${siteId}`);
      }
      return entry;
    },
  };
};
