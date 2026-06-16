import type {
  RuntimeAuthFailureRecoveryContext,
  RuntimeAuthFailureRecoveryResult,
} from "../src/electron-runtime/contracts.js";
import type {
  SiteSessionEngineHint,
  SiteSessionRegistryEntry,
  SiteSessionState,
} from "../src/types/siteSession.js";
import type { SiteSessionRegistry } from "./siteSessionRegistry.mjs";

type SiteSessionAuthRecoveryOptions = {
  registry: SiteSessionRegistry;
  syncSiteSession(siteId: string): Promise<SiteSessionState>;
  onRegistryChanged?(): void;
  log?(message: string, details?: unknown): void;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeHttpUrl = (value: unknown): string | null => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const normalizeEngineHint = (value: unknown): SiteSessionEngineHint | null => (
  value === "yt-dlp" || value === "gallery-dl"
    ? value
    : null
);

const resolveAuthFailurePageUrl = (
  context: RuntimeAuthFailureRecoveryContext,
): string | null => (
  normalizeHttpUrl(context.request.pageUrl)
  ?? normalizeHttpUrl(context.plan?.intent.pageUrl)
  ?? normalizeHttpUrl(context.request.url)
  ?? normalizeHttpUrl(context.plan?.intent.originalUrl)
);

const isAutoSyncEligible = (entry: SiteSessionRegistryEntry): boolean => (
  entry.autoSyncAllowed === true
  && (entry.syncAuthorization === "seeded" || entry.syncAuthorization === "user_enabled")
);

const hasSavedCookies = (state: SiteSessionState): boolean => (
  state.lastError === null
  && state.cookieCount > 0
  && state.availability !== "missing"
);

export const handleAuthRequiredSiteSessionRecovery = async (
  context: RuntimeAuthFailureRecoveryContext,
  options: SiteSessionAuthRecoveryOptions,
): Promise<RuntimeAuthFailureRecoveryResult> => {
  const pageUrl = resolveAuthFailurePageUrl(context);
  if (!pageUrl) {
    options.log?.("Cannot discover auth-required site without an HTTP URL", {
      traceId: context.traceId,
    });
    return { shouldRetry: false };
  }

  const entry = options.registry.upsertAuthRequiredSite({
    pageUrl,
    siteId: context.plan?.intent.siteId,
    siteHint: context.request.siteHint,
    displayName: context.request.title ?? context.plan?.label,
    engineHint: normalizeEngineHint(context.chosenEngine),
  });
  if (!entry) {
    return { shouldRetry: false };
  }

  options.onRegistryChanged?.();

  if (!isAutoSyncEligible(entry)) {
    options.log?.("Auth-required site discovered; waiting for user-enabled sync", {
      traceId: context.traceId,
      siteId: entry.siteId,
      authorization: entry.syncAuthorization,
    });
    return { shouldRetry: false };
  }

  try {
    const state = await options.syncSiteSession(entry.siteId);
    options.onRegistryChanged?.();
    return {
      shouldRetry: hasSavedCookies(state),
    };
  } catch (error) {
    options.log?.("Auth-required extension sync failed", {
      traceId: context.traceId,
      siteId: entry.siteId,
      error: error instanceof Error ? error.message : String(error),
    });
    options.onRegistryChanged?.();
    return { shouldRetry: false };
  }
};
