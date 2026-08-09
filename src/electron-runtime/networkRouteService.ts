import { parseManualNetworkProxy } from "../config/networkProxy.js";
import {
  buildDirectRouteResolution,
  NETWORK_FAILURE_CLASSIFICATIONS,
  parseElectronProxyRulesToRoute,
  resolveEnvironmentRouteForTarget,
  type NetworkConsumer,
  type NetworkResolutionStep,
  type NetworkRouteResolution,
} from "../config/networkRoute.js";

/**
 * The single proxy-source precedence policy shared by every consumer:
 *
 *   1. effective manual proxy
 *   2. URL-specific Electron/Chromium system result (proxy or explicit DIRECT)
 *   3. target-resolved environment route (only when the system tier is
 *      unavailable or not applicable — never after an explicit system DIRECT)
 *   4. final direct
 *
 * Final direct has three distinct states: an explicit system DIRECT is a
 * resolved direct route with source "system"; a not-applicable system tier
 * (resolveSystemProxyRules returns null) with no environment route is a
 * resolved direct route with source "direct"; a throwing system resolution
 * with no environment route is a fallback direct route with source "fallback"
 * plus a RESOLUTION_FAILED failure. A system result that is
 * multiple/malformed/unsupported becomes an explicit complex route and never
 * silently falls through to the environment tier.
 */

export type NetworkRouteServiceDependencies = {
  /** Effective manual proxy URL, or null when the effective policy is system. */
  getEffectiveManualProxyUrl(): string | null;
  /**
   * Electron/Chromium system proxy rules for one target URL, or null when
   * unavailable. The service never reads the system proxy itself.
   */
  resolveSystemProxyRules(targetUrl: string): Promise<string | null>;
  /** Snapshot of the relevant process environment variables. */
  getEnvironment(): Record<string, string | undefined>;
};

export type NetworkRouteService = {
  resolveRoute(input: {
    targetUrl: string;
    consumer: NetworkConsumer;
  }): Promise<NetworkRouteResolution>;
};

export const createNetworkRouteService = (
  deps: NetworkRouteServiceDependencies,
): NetworkRouteService => {
  const resolveRoute = async (input: {
    targetUrl: string;
    consumer: NetworkConsumer;
  }): Promise<NetworkRouteResolution> => {
    const { targetUrl, consumer } = input;

    // Tier 1: effective manual proxy.
    const manualUrl = deps.getEffectiveManualProxyUrl();
    if (manualUrl) {
      const manual = parseManualNetworkProxy(manualUrl);
      if (manual) {
        return {
          preference: "manual",
          effectivePolicyReason: "manual_active",
          consumer,
          targetUrl,
          route: {
            mode: "proxy",
            source: "manual",
            protocol: manual.scheme,
            proxyUrl: manual.url,
            resolvedFor: targetUrl,
          },
          status: "resolved",
          trace: [
            {
              tier: "manual",
              outcome: "applied",
              detail: "Effective manual proxy applied for the canonical target.",
            },
          ],
        };
      }
    }

    // Tier 2: URL-specific Electron/Chromium system resolution.
    const trace: NetworkResolutionStep[] = [];
    let systemUnavailable = false;
    let systemRules: string | null = null;
    try {
      systemRules = await deps.resolveSystemProxyRules(targetUrl);
    } catch {
      systemUnavailable = true;
    }

    if (systemUnavailable) {
      trace.push({
        tier: "system",
        outcome: "failed",
        detail: "System proxy resolution failed for the target URL.",
      });
    } else if (systemRules !== null) {
      const parsed = parseElectronProxyRulesToRoute(systemRules, targetUrl);
      if (parsed.kind === "proxy") {
        trace.push({
          tier: "system",
          outcome: "applied",
          detail: "Single system proxy directive applied for the canonical target.",
        });
        return {
          preference: "system",
          effectivePolicyReason: null,
          consumer,
          targetUrl,
          route: parsed.route,
          status: "resolved",
          trace,
        };
      }
      if (parsed.kind === "complex") {
        trace.push({
          tier: "system",
          outcome: "complex",
          detail: `Complex system proxy result (${parsed.route.reason}); not applied to CLI.`,
        });
        return {
          preference: "system",
          effectivePolicyReason: null,
          consumer,
          targetUrl,
          route: parsed.route,
          status: "resolved",
          trace,
        };
      }
      // An explicit system DIRECT is final: Chromium/system chose direct for
      // this target, so the environment tier must not be evaluated. This is
      // distinct from system-unavailable fallback (source fallback + status
      // fallback + RESOLUTION_FAILED) and from the default direct route.
      return buildDirectRouteResolution(targetUrl, consumer, {
        source: "system",
        reason: "resolved_direct",
        status: "resolved",
        trace: [
          ...trace,
          {
            tier: "system",
            outcome: "direct",
            detail: "System explicitly resolved direct access for the canonical target.",
          },
        ],
      });
    } else {
      trace.push({
        tier: "system",
        outcome: "unavailable",
        detail: "System proxy resolution is not applicable for the target URL; environment route evaluated.",
      });
    }

    // Tier 3: target-resolved environment route.
    const environmentRoute = resolveEnvironmentRouteForTarget(
      deps.getEnvironment(),
      targetUrl,
    );
    if (environmentRoute.mode === "proxy" || environmentRoute.mode === "complex") {
      trace.push({
        tier: "environment",
        outcome: environmentRoute.mode === "proxy" ? "applied" : "complex",
        detail: environmentRoute.mode === "proxy"
          ? "Environment proxy applied for the canonical target."
          : `Complex environment proxy result (${environmentRoute.reason}); not applied to CLI.`,
      });
      return {
        preference: "system",
        effectivePolicyReason: null,
        consumer,
        targetUrl,
        route: environmentRoute,
        status: systemUnavailable ? "fallback" : "resolved",
        trace,
        ...(systemUnavailable
          ? {
              failure: {
                classification: NETWORK_FAILURE_CLASSIFICATIONS.RESOLUTION_FAILED,
                message: "System proxy resolution failed; environment route used.",
              },
            }
          : {}),
      };
    }
    // An explicit NO_PROXY match is itself a final direct route with source
    // environment; it wins over the system-tier direct outcome.
    if (environmentRoute.mode === "direct" && environmentRoute.reason === "no_proxy_match") {
      trace.push({
        tier: "environment",
        outcome: "direct",
        detail: "NO_PROXY matched the canonical target host; explicit direct route.",
      });
      return {
        preference: "system",
        effectivePolicyReason: null,
        consumer,
        targetUrl,
        route: environmentRoute,
        status: systemUnavailable ? "fallback" : "resolved",
        trace,
        ...(systemUnavailable
          ? {
              failure: {
                classification: NETWORK_FAILURE_CLASSIFICATIONS.RESOLUTION_FAILED,
                message: "System proxy resolution failed; NO_PROXY direct route used.",
              },
            }
          : {}),
      };
    }
    trace.push({
      tier: "environment",
      outcome: "direct",
      detail: "No environment proxy rule applies to the canonical target.",
    });

    // Tier 4: final direct. Three distinct states:
    // - system resolution threw: resolution failure, direct fallback.
    // - system tier not applicable (null): a plain direct route — source
    //   "direct" records that no higher-priority source produced a route,
    //   distinct from an explicit system DIRECT (source "system").
    if (systemUnavailable) {
      return buildDirectRouteResolution(targetUrl, consumer, {
        source: "fallback",
        reason: "resolution_fallback",
        status: "fallback",
        trace,
        failure: {
          classification: NETWORK_FAILURE_CLASSIFICATIONS.RESOLUTION_FAILED,
          message: "System proxy resolution failed; direct fallback used.",
        },
      });
    }
    return buildDirectRouteResolution(targetUrl, consumer, {
      source: "direct",
      reason: "no_proxy_source",
      status: "resolved",
      trace,
    });
  };

  return { resolveRoute };
};
