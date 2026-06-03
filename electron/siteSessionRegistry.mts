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
  listEntries(): SiteSessionRegistryEntry[];
  listVisibleEntries(): SiteSessionRegistryEntry[];
  getEntry(siteId: string): SiteSessionRegistryEntry | null;
  requireEntry(siteId: string): SiteSessionRegistryEntry;
  matchEntryForUrl(url: string): SiteSessionRegistryEntry | null;
  activateEntry(siteId: string, source: SiteSessionRegistryEntry["discoverySources"][number]): SiteSessionRegistryEntry;
  upsertAuthRequiredSite(options: {
    pageUrl?: string | null;
    siteId?: string | null;
    siteHint?: string | null;
    displayName?: string | null;
    engineHint?: SiteSessionRegistryEntry["engineHints"][number] | null;
  }): SiteSessionRegistryEntry | null;
  enableCurrentTabSite(options: {
    pageUrl: string;
    displayName?: string | null;
  }): SiteSessionRegistryEntry;
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

const normalizeHost = (value: unknown): string | null => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  return normalized.replace(/^\.+/, "").toLowerCase();
};

const normalizeHostFromUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return normalizeHost(parsed.hostname);
  } catch {
    return null;
  }
};

const normalizeCookieDomain = (value: unknown): string | null => (
  normalizeHost(value)
);

const domainMatches = (host: string, domain: string): boolean => {
  const normalizedHost = normalizeHost(host);
  const normalizedDomain = normalizeCookieDomain(domain);
  return Boolean(
    normalizedHost
    && normalizedDomain
    && (
      normalizedHost === normalizedDomain
      || normalizedHost.endsWith(`.${normalizedDomain}`)
    ),
  );
};

const deriveSiteIdFromHost = (host: string): string => (
  `site-${host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`
);

const normalizeEngineHint = (
  value: unknown,
): SiteSessionRegistryEntry["engineHints"][number] | null => (
  value === "yt-dlp" || value === "gallery-dl" || value === "douyin-dl"
    ? value
    : null
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
          syncAuthorization: seed.syncAuthorization,
          autoSyncAllowed: seed.autoSyncAllowed,
          discoverySources: Array.from(new Set([...seed.discoverySources, ...existing.discoverySources])),
          visibility: seed.discoverySources.includes("seed") ? "visible" : existing.visibility,
          icon: existing.icon.kind === "placeholder" ? seed.icon : existing.icon,
          updatedAtMs: Math.max(existing.updatedAtMs, seed.updatedAtMs),
        }
      : seed);
  }
  return Array.from(entries.values()).sort((left, right) => (
    left.displayName.localeCompare(right.displayName)
  ));
};

const createUserEnabledEntry = (
  options: {
    pageUrl: string;
    host: string;
    displayName?: string | null;
    nowMs: number;
    existingSiteIds: Set<string>;
  },
): SiteSessionRegistryEntry => {
  const baseSiteId = deriveSiteIdFromHost(options.host);
  let siteId = baseSiteId;
  let suffix = 2;
  while (options.existingSiteIds.has(siteId)) {
    siteId = `${baseSiteId}-${suffix}`;
    suffix += 1;
  }

  return {
    siteId,
    displayName: normalizeString(options.displayName) ?? options.host,
    primaryUrl: options.pageUrl,
    primaryHost: options.host,
    cookieDomains: [options.host],
    requiredCookieKeys: [],
    loginCookieKeys: [],
    syncAuthorization: "user_enabled",
    autoSyncAllowed: true,
    discoverySources: ["extension_current_tab"],
    engineHints: [],
    visibility: "visible",
    icon: {
      kind: "placeholder",
    },
    createdAtMs: options.nowMs,
    updatedAtMs: options.nowMs,
  };
};

const createAutoDiscoveredEntry = (
  options: {
    pageUrl: string;
    host: string;
    siteId?: string | null;
    siteHint?: string | null;
    displayName?: string | null;
    engineHint?: SiteSessionRegistryEntry["engineHints"][number] | null;
    nowMs: number;
    existingSiteIds: Set<string>;
  },
): SiteSessionRegistryEntry => {
  const requestedId = normalizeString(options.siteId)
    ?? normalizeString(options.siteHint);
  const baseSiteId = requestedId && requestedId !== "generic"
    ? requestedId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    : deriveSiteIdFromHost(options.host);
  let siteId = baseSiteId || deriveSiteIdFromHost(options.host);
  let suffix = 2;
  while (options.existingSiteIds.has(siteId)) {
    siteId = `${baseSiteId}-${suffix}`;
    suffix += 1;
  }
  const engineHint = normalizeEngineHint(options.engineHint);

  return {
    siteId,
    displayName: normalizeString(options.displayName) ?? normalizeString(options.siteHint) ?? options.host,
    primaryUrl: options.pageUrl,
    primaryHost: options.host,
    cookieDomains: [options.host],
    requiredCookieKeys: [],
    loginCookieKeys: [],
    syncAuthorization: "auto_discovered",
    autoSyncAllowed: false,
    discoverySources: ["auth_required"],
    engineHints: engineHint ? [engineHint] : [],
    visibility: "visible",
    icon: {
      kind: "placeholder",
    },
    createdAtMs: options.nowMs,
    updatedAtMs: options.nowMs,
  };
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
    listEntries() {
      return loadEntries();
    },
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
    activateEntry(siteId, source) {
      const currentEntries = loadEntries();
      const matchedEntry = currentEntries.find((entry) => entry.siteId === siteId);
      if (!matchedEntry) {
        throw new Error(`Unsupported site session: ${siteId}`);
      }
      const nextEntry: SiteSessionRegistryEntry = {
        ...matchedEntry,
        visibility: "visible",
        discoverySources: Array.from(new Set([
          ...matchedEntry.discoverySources,
          source,
        ])),
        updatedAtMs: now(),
      };
      entries = currentEntries.map((entry) => (
        entry.siteId === nextEntry.siteId ? nextEntry : entry
      ));
      persistEntries(entries);
      return nextEntry;
    },
    matchEntryForUrl(url) {
      const host = normalizeHostFromUrl(url);
      if (!host) {
        return null;
      }
      return loadEntries().find((entry) => (
        domainMatches(host, entry.primaryHost)
        || entry.cookieDomains.some((domain) => domainMatches(host, domain))
      )) ?? null;
    },
    upsertAuthRequiredSite(options_) {
      const pageUrl = normalizeString(options_.pageUrl);
      const host = pageUrl ? normalizeHostFromUrl(pageUrl) : null;
      if (!pageUrl || !host) {
        return null;
      }

      const currentEntries = loadEntries();
      const matchedEntry = this.matchEntryForUrl(pageUrl)
        ?? (normalizeString(options_.siteId)
          ? this.getEntry(normalizeString(options_.siteId) as string)
          : null);
      if (matchedEntry) {
        const engineHint = normalizeEngineHint(options_.engineHint);
        const nextEntry = this.activateEntry(matchedEntry.siteId, "auth_required");
        const nextEntryWithEngineHint: SiteSessionRegistryEntry = {
          ...nextEntry,
          engineHints: engineHint
            ? Array.from(new Set([...nextEntry.engineHints, engineHint]))
            : nextEntry.engineHints,
          updatedAtMs: now(),
        };
        entries = loadEntries().map((entry) => (
          entry.siteId === nextEntryWithEngineHint.siteId ? nextEntryWithEngineHint : entry
        ));
        persistEntries(entries);
        return nextEntryWithEngineHint;
      }

      const nextEntry = createAutoDiscoveredEntry({
        pageUrl,
        host,
        siteId: options_.siteId,
        siteHint: options_.siteHint,
        displayName: options_.displayName,
        engineHint: options_.engineHint,
        nowMs: now(),
        existingSiteIds: new Set(currentEntries.map((entry) => entry.siteId)),
      });
      entries = [...currentEntries, nextEntry].sort((left, right) => (
        left.displayName.localeCompare(right.displayName)
      ));
      persistEntries(entries);
      return nextEntry;
    },
    enableCurrentTabSite(options_) {
      const pageUrl = normalizeString(options_.pageUrl);
      const host = pageUrl ? normalizeHostFromUrl(pageUrl) : null;
      if (!pageUrl || !host) {
        throw new Error("Cannot enable login state for a non-HTTP site");
      }

      const currentEntries = loadEntries();
      const matchedEntry = this.matchEntryForUrl(pageUrl);
      if (matchedEntry) {
        const nextEntry: SiteSessionRegistryEntry = {
          ...matchedEntry,
          syncAuthorization: matchedEntry.syncAuthorization === "seeded"
            ? matchedEntry.syncAuthorization
            : "user_enabled",
          autoSyncAllowed: true,
          discoverySources: Array.from(new Set([
            ...matchedEntry.discoverySources,
            "extension_current_tab" as const,
          ])),
          visibility: "visible",
          updatedAtMs: now(),
        };
        entries = currentEntries.map((entry) => (
          entry.siteId === nextEntry.siteId ? nextEntry : entry
        ));
        persistEntries(entries);
        return nextEntry;
      }

      const nextEntry = createUserEnabledEntry({
        pageUrl,
        host,
        displayName: options_.displayName,
        nowMs: now(),
        existingSiteIds: new Set(currentEntries.map((entry) => entry.siteId)),
      });
      entries = [...currentEntries, nextEntry].sort((left, right) => (
        left.displayName.localeCompare(right.displayName)
      ));
      persistEntries(entries);
      return nextEntry;
    },
  };
};
