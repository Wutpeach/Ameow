import type { Session } from "electron";

export type DesktopProxyApplyResult = {
  mode: "system";
  proxyRules: null;
};

export type DesktopProxySession = Pick<Session, "setProxy">;

export async function applySystemProxyToSession(
  targetSession: DesktopProxySession,
): Promise<DesktopProxyApplyResult> {
  await targetSession.setProxy({ mode: "system" });
  return {
    mode: "system",
    proxyRules: null,
  };
}
