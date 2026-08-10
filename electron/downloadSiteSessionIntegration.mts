import type {
  RuntimeAdvancedQualitySiteSessionRefreshContext,
  RuntimeAuthFailureRecoveryContext,
  RuntimeAuthFailureRecoveryResult,
  RuntimeDownloadSiteSessionRefreshContext,
} from "../src/electron-runtime/contracts.js";
import type { EngineExecutionContextWithRuntime } from "../src/electron-runtime/engineExecutionContext.js";
import { ADVANCED_QUALITY_SUPPORTED_SITE_IDS } from "../src/electron-runtime/service.js";
import type { RawDownloadInput } from "../src/core/index.js";
import type {
  SiteSessionRegistryEntry,
  SiteSessionState,
} from "../src/types/siteSession.js";
import type { SiteSessionRegistry } from "./siteSessionRegistry.mjs";
import type { SiteSessionManager } from "./siteSessionManager.mjs";
import type { SiteSessionRefreshScheduler } from "./siteSessionRefreshScheduler.mjs";
import { handleAuthRequiredSiteSessionRecovery } from "./siteSessionAuthRecovery.mjs";

/**
 * Bounded Electron-side integration for download site sessions. This module
 * owns only the download-specific session refresh/cookie/recovery policy that
 * previously lived inline in `main.mts`; it never starts a second download
 * flow and never resolves Site/Plan/NetworkRoute. All registry/manager/
 * scheduler/extension/log dependencies are injected by the Electron
 * composition root.
 */

const ADVANCED_QUALITY_SESSION_REFRESH_STALE_MS = 24 * 60 * 60 * 1000;
const ADVANCED_QUALITY_SESSION_REFRESH_TIMEOUT_MS = 2_500;
const DOWNLOAD_START_SESSION_REFRESH_FRESH_MS = 60 * 60 * 1000;
const DOWNLOAD_START_SESSION_REFRESH_TIMEOUT_MS = 5_000;

export type DownloadSiteSessionIntegrationOptions = {
  getRegistry(): SiteSessionRegistry;
  getManager(siteId: string): SiteSessionManager | null;
  getRefreshScheduler(): SiteSessionRefreshScheduler;
  getConnectedExtensionClientCount(): number;
  syncSiteSession(siteId: string): Promise<SiteSessionState>;
  onRegistryChanged?(): void;
  log?(scope: string, message: string, details?: unknown): void;
};

export type DownloadSiteSessionIntegration = {
  refreshSiteSessionBeforeDownload(
    context: RuntimeDownloadSiteSessionRefreshContext,
  ): Promise<void>;
  refreshSiteSessionBeforeAdvancedQualityProbe(
    context: RuntimeAdvancedQualitySiteSessionRefreshContext,
  ): Promise<void>;
  buildDownloadExecutionContext(
    context: EngineExecutionContextWithRuntime,
    input: RawDownloadInput,
  ): EngineExecutionContextWithRuntime;
  handleAuthRequiredFailure(
    context: RuntimeAuthFailureRecoveryContext,
  ): Promise<RuntimeAuthFailureRecoveryResult>;
};

const resolveSiteSessionEntryForDownload = (
  options: DownloadSiteSessionIntegrationOptions,
  { siteId, pageUrl, url }: {
    siteId: string | null;
    pageUrl?: string;
    url: string;
  },
): SiteSessionRegistryEntry | null => {
  const registry = options.getRegistry();
  const matchedByPageUrl = pageUrl ? registry.matchEntryForUrl(pageUrl) : null;
  if (matchedByPageUrl) {
    return matchedByPageUrl;
  }
  const matchedByUrl = url ? registry.matchEntryForUrl(url) : null;
  if (matchedByUrl) {
    return matchedByUrl;
  }
  return siteId ? registry.getEntry(siteId) : null;
};

const shouldSkipDownloadStartSiteSessionRefresh = (
  options: DownloadSiteSessionIntegrationOptions,
  entry: SiteSessionRegistryEntry,
  state: SiteSessionState,
): string | null => {
  if (entry.syncAuthorization !== "seeded" && entry.syncAuthorization !== "user_enabled") {
    return "sync_not_authorized";
  }
  if (options.getConnectedExtensionClientCount() <= 0) {
    return "extension_disconnected";
  }
  if (
    entry.requiredCookieKeys.length > 0
    || entry.loginCookieKeys.length > 0
  ) {
    if (state.availability !== "ready") {
      return null;
    }
  }
  if (
    typeof state.updatedAtMs === "number"
    && Date.now() - state.updatedAtMs < DOWNLOAD_START_SESSION_REFRESH_FRESH_MS
  ) {
    return "snapshot_fresh";
  }
  return null;
};

const shouldSkipAdvancedQualitySiteSessionRefresh = (
  options: DownloadSiteSessionIntegrationOptions,
  entry: SiteSessionRegistryEntry,
  state: SiteSessionState,
): string | null => {
  if (!ADVANCED_QUALITY_SUPPORTED_SITE_IDS.has(entry.siteId)) {
    return "site_not_enabled";
  }
  if (entry.syncAuthorization !== "seeded" && entry.syncAuthorization !== "user_enabled") {
    return "sync_not_authorized";
  }
  if (options.getConnectedExtensionClientCount() <= 0) {
    return "extension_disconnected";
  }
  if (
    typeof state.updatedAtMs === "number"
    && Date.now() - state.updatedAtMs < ADVANCED_QUALITY_SESSION_REFRESH_STALE_MS
  ) {
    return "snapshot_fresh";
  }
  return null;
};

const refreshSiteSessionBeforeDownload = (
  options: DownloadSiteSessionIntegrationOptions,
  context: RuntimeDownloadSiteSessionRefreshContext,
): Promise<void> => {
  const log = options.log ?? ((): void => undefined);
  const entry = resolveSiteSessionEntryForDownload(options, {
    siteId: context.siteId,
    pageUrl: context.pageUrl,
    url: context.url,
  });
  const manager = entry ? options.getManager(entry.siteId) : null;
  if (!entry || !manager) {
    log("DownloadStartSession", "sync skipped", {
      traceId: context.traceId,
      siteId: context.siteId,
      reason: "unsupported_site",
      url: context.pageUrl || context.url,
    });
    return Promise.resolve();
  }

  return manager.getState().then(async (state) => {
    const skipReason = shouldSkipDownloadStartSiteSessionRefresh(options, entry, state);
    if (skipReason) {
      log("DownloadStartSession", "sync skipped", {
        traceId: context.traceId,
        siteId: entry.siteId,
        requestedSiteId: context.siteId,
        reason: skipReason,
        updatedAtMs: state.updatedAtMs,
        url: context.pageUrl || context.url,
      });
      return;
    }

    await options.getRefreshScheduler().ensureRefreshed(
      entry.siteId,
      {
        reason: "download_start",
        onlyIfDue: false,
        timeoutMs: DOWNLOAD_START_SESSION_REFRESH_TIMEOUT_MS,
      },
    ).then(
      (nextState) => {
        log("DownloadStartSession", "sync completed", {
          traceId: context.traceId,
          siteId: entry.siteId,
          availability: nextState?.availability ?? null,
          cookieCount: nextState?.cookieCount ?? null,
        });
      },
      (error) => {
        log("DownloadStartSession", "sync failed; continuing download", {
          traceId: context.traceId,
          siteId: entry.siteId,
          error: error?.message || String(error),
        });
      },
    );
  });
};

const refreshSiteSessionBeforeAdvancedQualityProbe = (
  options: DownloadSiteSessionIntegrationOptions,
  context: RuntimeAdvancedQualitySiteSessionRefreshContext,
): Promise<void> => {
  const log = options.log ?? ((): void => undefined);
  const entry = options.getRegistry().getEntry(context.siteId);
  const manager = entry ? options.getManager(entry.siteId) : null;
  if (!entry || !manager) {
    log("AdvancedQualitySession", "pre-probe sync skipped", {
      traceId: context.traceId,
      siteId: context.siteId,
      reason: "unsupported_site",
      url: context.pageUrl || context.url,
    });
    return Promise.resolve();
  }

  return manager.getState().then(async (state) => {
    const skipReason = shouldSkipAdvancedQualitySiteSessionRefresh(options, entry, state);
    if (skipReason) {
      log("AdvancedQualitySession", "pre-probe sync skipped", {
        traceId: context.traceId,
        siteId: entry.siteId,
        reason: skipReason,
        updatedAtMs: state.updatedAtMs,
        url: context.pageUrl || context.url,
      });
      return;
    }

    await options.getRefreshScheduler().ensureRefreshed(
      entry.siteId,
      {
        reason: "advanced_quality",
        force: true,
        onlyIfDue: false,
        timeoutMs: ADVANCED_QUALITY_SESSION_REFRESH_TIMEOUT_MS,
      },
    ).then(
      () => {
        log("AdvancedQualitySession", "pre-probe sync completed", {
          traceId: context.traceId,
          siteId: entry.siteId,
        });
      },
      (error) => {
        log("AdvancedQualitySession", "pre-probe sync failed; continuing with saved snapshot", {
          traceId: context.traceId,
          siteId: entry.siteId,
          error: error?.message || String(error),
        });
      },
    );
  });
};

export const createDownloadSiteSessionIntegration = (
  options: DownloadSiteSessionIntegrationOptions,
): DownloadSiteSessionIntegration => ({
  refreshSiteSessionBeforeDownload: (context) =>
    refreshSiteSessionBeforeDownload(options, context),
  refreshSiteSessionBeforeAdvancedQualityProbe: (context) =>
    refreshSiteSessionBeforeAdvancedQualityProbe(options, context),
  buildDownloadExecutionContext(context, input) {
    const entry = resolveSiteSessionEntryForDownload(options, {
      siteId: context.intent.siteId,
      pageUrl: context.intent.pageUrl ?? input?.pageUrl,
      url: context.intent.originalUrl ?? input?.url,
    });
    const appOwnedCookies = entry
      ? options.getManager(entry.siteId)?.getDownloadCookies() ?? null
      : null;
    return {
      ...context,
      // Enrich the per-attempt auth material with the app-owned site session.
      // Never clones or mutates the shared intent/plan object.
      cookies: appOwnedCookies ?? context.cookies,
    };
  },
  handleAuthRequiredFailure(context) {
    return handleAuthRequiredSiteSessionRecovery(context, {
      registry: options.getRegistry(),
      syncSiteSession: options.syncSiteSession,
      onRegistryChanged: options.onRegistryChanged,
      log: options.log ? (message, details) => options.log?.("SiteSessionAuth", message, details) : undefined,
    });
  },
});
