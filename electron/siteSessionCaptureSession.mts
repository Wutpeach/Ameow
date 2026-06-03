import type { Session } from "electron";

import {
  collectSupplementalCookiesFromRequest,
  prepareSiteSessionCapturePartition,
  resolveSiteSessionCaptureAcceptLanguages,
  resolveSiteSessionCaptureUserAgent,
  shouldAllowSiteSessionCapturePermission,
  type SiteSessionCapturePartitionSetupState,
} from "./siteSessionCaptureHardening.mjs";
import {
  applyConfiguredProxyToSession,
  type DesktopProxySession,
} from "./desktopProxy.mjs";

type CaptureSession = DesktopProxySession
  & Pick<Session, "setUserAgent" | "setPermissionCheckHandler" | "setPermissionRequestHandler" | "webRequest">;

type SiteSessionCaptureSite = {
  id: string;
  cookieDomains: string[];
};

type ConfigureSiteSessionCaptureSessionOptions = {
  site: SiteSessionCaptureSite;
  partition: string;
  captureSession: CaptureSession;
  proxyConfig: Record<string, unknown> | null;
  locale: string;
  rawUserAgent: string;
  state: SiteSessionCapturePartitionSetupState;
  log?(message: string, details?: unknown): void;
};

export async function configureSiteSessionCaptureSession(
  options: ConfigureSiteSessionCaptureSessionOptions,
): Promise<void> {
  const {
    site,
    partition,
    captureSession,
    proxyConfig,
    locale,
    rawUserAgent,
    state,
    log,
  } = options;
  await applyConfiguredProxyToSession(captureSession, proxyConfig);

  const userAgent = resolveSiteSessionCaptureUserAgent(rawUserAgent);
  const acceptLanguages = resolveSiteSessionCaptureAcceptLanguages(locale);
  const partitionSetup = prepareSiteSessionCapturePartition(state, partition);

  captureSession.setUserAgent(userAgent, acceptLanguages);
  if (!partitionSetup.shouldConfigureSession) {
    return;
  }

  captureSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    log?.("Denied capture permission check", {
      siteId: site.id,
      permission,
      requestingOrigin,
      webContentsId: webContents?.id ?? null,
    });
    return shouldAllowSiteSessionCapturePermission();
  });
  captureSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    log?.("Denied capture permission request", {
      siteId: site.id,
      permission,
      requestingOrigin: details?.requestingUrl ?? null,
      webContentsId: webContents?.id ?? null,
    });
    callback(shouldAllowSiteSessionCapturePermission());
  });

  captureSession.webRequest.onBeforeSendHeaders(
    { urls: site.cookieDomains.flatMap((domain) => [`*://*.${domain}/*`, `*://${domain}/*`]) },
    (details, callback) => {
      try {
        const supplementalCookies = state.supplementalCookiesByPartition.get(partition) ?? {};
        state.supplementalCookiesByPartition.set(partition, supplementalCookies);
        collectSupplementalCookiesFromRequest({
          url: details.url,
          requestHeaders: details.requestHeaders,
          cookieDomains: site.cookieDomains,
          supplementalCookies,
        });
      } catch (error) {
        log?.("Failed to collect supplemental request cookies", {
          siteId: site.id,
          error: String(error),
        });
      }
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}
