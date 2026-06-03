import type { Session } from "electron";

import {
  describeGlobalProxyValidationError,
  validateGlobalProxySettings,
} from "../src/config/globalProxy.js";

export type DesktopProxyApplyResult =
  | {
      mode: "system";
      proxyRules: null;
    }
  | {
      mode: "fixed_servers";
      proxyRules: string;
    };

export type DesktopProxySession = Pick<Session, "setProxy">;

export const DESKTOP_PROXY_BYPASS_RULES = "<local>;localhost;127.0.0.1;::1";

export async function applyConfiguredProxyToSession(
  targetSession: DesktopProxySession,
  config: Record<string, unknown> | null,
): Promise<DesktopProxyApplyResult> {
  const validation = validateGlobalProxySettings(config ?? {});

  if (!validation.enabled) {
    await targetSession.setProxy({ mode: "system" });
    return {
      mode: "system",
      proxyRules: null,
    };
  }

  if (validation.errorCode || !validation.normalizedUrl) {
    throw new Error(describeGlobalProxyValidationError(
      validation.errorCode ?? "invalid_url",
    ));
  }

  await targetSession.setProxy({
    mode: "fixed_servers",
    proxyRules: validation.normalizedUrl,
    proxyBypassRules: DESKTOP_PROXY_BYPASS_RULES,
  });
  return {
    mode: "fixed_servers",
    proxyRules: validation.normalizedUrl,
  };
}
