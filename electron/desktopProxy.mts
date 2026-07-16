import type { Session } from "electron";

import {
  parseManualNetworkProxy,
  type ManualNetworkProxy,
} from "../src/config/networkProxy.js";

export type DesktopProxyApplyResult = {
  mode: "system" | "manual";
  proxyRules: string | null;
  proxyBypassRules?: string | null;
};

export type DesktopProxySession = Pick<Session, "setProxy">;

export const DESKTOP_PROXY_BYPASS_RULES = [
  "<local>",
  "localhost",
  "127.0.0.1",
  "127.0.0.1:39527",
  "::1",
].join(";");

const buildFixedServerProxyRules = (proxy: ManualNetworkProxy): string => {
  const endpoint = proxy.port ? `${proxy.host}:${proxy.port}` : proxy.host;
  const proxyPrefix = proxy.scheme === "https" ? "https://" : "";
  const proxyEndpoint = `${proxyPrefix}${endpoint}`;
  return `http=${proxyEndpoint};https=${proxyEndpoint}`;
};

export async function applySystemProxyToSession(
  targetSession: DesktopProxySession,
): Promise<DesktopProxyApplyResult> {
  await targetSession.setProxy({ mode: "system" });
  return {
    mode: "system",
    proxyRules: null,
  };
}

export async function applyManualProxyToSession(
  targetSession: DesktopProxySession,
  proxyUrl: string,
): Promise<DesktopProxyApplyResult> {
  const proxy = parseManualNetworkProxy(proxyUrl);
  if (!proxy) {
    return applySystemProxyToSession(targetSession);
  }

  const proxyRules = buildFixedServerProxyRules(proxy);
  await targetSession.setProxy({
    mode: "fixed_servers",
    proxyRules,
    proxyBypassRules: DESKTOP_PROXY_BYPASS_RULES,
  });
  return {
    mode: "manual",
    proxyRules,
    proxyBypassRules: DESKTOP_PROXY_BYPASS_RULES,
  };
}
