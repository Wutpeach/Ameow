import type { ErrorDiagnosticCopyRequest } from "../types/errorDiagnostics";

/**
 * Recovery affordances offered next to a failure headline.
 *
 * Only the network category exposes recovery controls: it is the one category
 * where a concrete user-side action (fix the proxy / retry the same input) is
 * both meaningful and safe. Every other category keeps the copy-only overlay,
 * so an output-path or content-availability failure never offers a "retry"
 * that would only fail again.
 */
export type ErrorDiagnosticRecoveryAction = "open_proxy_settings" | "retry";

/** Windows Settings deep link for the system proxy page. */
export const WINDOWS_NETWORK_PROXY_SETTINGS_URI = "ms-settings:network-proxy";

type RetryTarget =
  | { kind: "transcode"; traceId: string }
  | { kind: "download"; url: string };

/**
 * Resolves what a Retry control would actually replay. Transcode failures
 * replay through their existing trace; download failures re-enqueue the same
 * input URL. Anything else has no replayable target and gets no Retry control.
 */
export const resolveErrorDiagnosticRetryTarget = (
  diagnostic?: ErrorDiagnosticCopyRequest | null,
): RetryTarget | null => {
  if (!diagnostic) {
    return null;
  }
  if (diagnostic.surface === "transcode") {
    const traceId = typeof diagnostic.traceId === "string" ? diagnostic.traceId.trim() : "";
    return traceId ? { kind: "transcode", traceId } : null;
  }
  const url = typeof diagnostic.failure?.userUrl === "string"
    ? diagnostic.failure.userUrl.trim()
    : "";
  return url ? { kind: "download", url } : null;
};

/**
 * Resolves the ordered recovery actions for the current failure. The proxy
 * settings shortcut is Windows-only because the deep link is a Windows URI.
 */
export const resolveErrorDiagnosticRecoveryActions = ({
  diagnostic,
  isWindows,
}: {
  diagnostic?: ErrorDiagnosticCopyRequest | null;
  isWindows: boolean;
}): ErrorDiagnosticRecoveryAction[] => {
  if (!diagnostic || diagnostic.category !== "network_proxy") {
    return [];
  }
  const actions: ErrorDiagnosticRecoveryAction[] = [];
  if (isWindows) {
    actions.push("open_proxy_settings");
  }
  if (resolveErrorDiagnosticRetryTarget(diagnostic)) {
    actions.push("retry");
  }
  return actions;
};
