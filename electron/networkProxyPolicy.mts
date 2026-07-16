import {
  NETWORK_PROXY_VALIDATION_TARGETS,
  isProxyShapedFailure,
  resolveNetworkProxyConfig,
  type EffectiveNetworkProxyPolicy,
  type ManualNetworkProxy,
  type NetworkProxyStatePayload,
  type NetworkProxyValidationTargetResult,
} from "../src/config/networkProxy.js";

export type ProxyFailureSignal = {
  layer: "electron_fetch" | "managed_bootstrap" | "pip" | "yt_dlp" | "gallery_dl";
  targetHost: string | null;
  reason: string;
};

type NetworkProxyPolicyControllerOptions = {
  readConfigObject(): Promise<Record<string, unknown>>;
  applySystemProxy(): Promise<void>;
  applyManualProxy(proxyUrl: string): Promise<void>;
  fetchWithManualProxy(proxyUrl: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  log(message: string): void;
  emitStateChanged(state: NetworkProxyStatePayload): void;
  now?(): number;
};

export type NetworkProxyPolicyController = {
  initializeFromConfig(): Promise<void>;
  reconfigureFromConfig(): Promise<void>;
  getEffectivePolicy(): EffectiveNetworkProxyPolicy;
  getState(): NetworkProxyStatePayload;
  resolveProxyUrl(): string | null;
  markManualProxySuspect(signal: ProxyFailureSignal): void;
};

const VALIDATION_TIMEOUT_MS = 8_000;
const VALIDATION_FRESH_MS = 30 * 60 * 1_000;

const emptySystemState = (now: number): NetworkProxyStatePayload => ({
  preferenceMode: "system",
  configuredProxy: null,
  effectivePolicy: {
    mode: "system",
    reason: "user_system",
  },
  validationStatus: "idle",
  validationResults: [],
  updatedAtMs: now,
});

const summarizeError = (error: unknown): string => (
  error instanceof Error && error.message ? error.message : String(error ?? "unknown error")
);

const withTimeout = async <T,>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
};

const isSuccessfulProbeResponse = (response: Response): boolean => (
  response.status >= 200 && response.status < 400
);

export const createNetworkProxyPolicyController = (
  options: NetworkProxyPolicyControllerOptions,
): NetworkProxyPolicyController => {
  const now = () => options.now?.() ?? Date.now();

  let state = emptySystemState(now());
  let validationEpoch = 0;
  let lastSuccessfulValidationAtMs = 0;

  const updateState = (nextState: NetworkProxyStatePayload) => {
    state = nextState;
    options.emitStateChanged(state);
  };

  const setSystemPolicy = async (
    reason: Extract<EffectiveNetworkProxyPolicy, { mode: "system" }>["reason"],
    configuredProxy: ManualNetworkProxy | null,
    validationStatus: NetworkProxyStatePayload["validationStatus"],
    validationResults: NetworkProxyValidationTargetResult[] = state.validationResults,
    preferenceMode: NetworkProxyStatePayload["preferenceMode"] = configuredProxy ? "manual" : "system",
  ) => {
    await options.applySystemProxy();
    updateState({
      preferenceMode,
      configuredProxy,
      effectivePolicy: {
        mode: "system",
        reason,
      },
      validationStatus,
      validationResults,
      updatedAtMs: now(),
    });
  };

  const setManualPolicy = async (
    manualProxy: ManualNetworkProxy,
    verifiedAtMs: number,
    validationStatus: NetworkProxyStatePayload["validationStatus"],
    validationResults: NetworkProxyValidationTargetResult[] = state.validationResults,
  ) => {
    await options.applyManualProxy(manualProxy.url);
    updateState({
      preferenceMode: "manual",
      configuredProxy: manualProxy,
      effectivePolicy: {
        mode: "manual",
        proxyUrl: manualProxy.url,
        verifiedAtMs,
      },
      validationStatus,
      validationResults,
      updatedAtMs: now(),
    });
  };

  const probeTarget = async (
    proxyUrl: string,
    target: (typeof NETWORK_PROXY_VALIDATION_TARGETS)[number],
  ): Promise<NetworkProxyValidationTargetResult> => {
    const runRequest = async (method: "HEAD" | "GET", signal: AbortSignal) => {
      const response = await options.fetchWithManualProxy(proxyUrl, target.url, {
        method,
        signal,
        headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
      });
      return response;
    };

    try {
      const response = await withTimeout(VALIDATION_TIMEOUT_MS, async (signal) => {
        const headResponse = await runRequest("HEAD", signal);
        if (headResponse.status === 405 || headResponse.status === 501) {
          return runRequest("GET", signal);
        }
        return headResponse;
      });

      return {
        id: target.id,
        url: target.url,
        ok: isSuccessfulProbeResponse(response),
        status: response.status,
        error: isSuccessfulProbeResponse(response)
          ? null
          : `${response.status} ${response.statusText}`.trim(),
      };
    } catch (error) {
      return {
        id: target.id,
        url: target.url,
        ok: false,
        status: null,
        error: summarizeError(error),
      };
    }
  };

  const validateManualProxy = async (
    manualProxy: ManualNetworkProxy,
    epoch: number,
  ) => {
    const results = await Promise.all(
      NETWORK_PROXY_VALIDATION_TARGETS.map((target) => probeTarget(manualProxy.url, target)),
    );
    if (epoch !== validationEpoch) {
      return;
    }

    const anySuccess = results.some((result) => result.ok);
    const proxyUnavailable = !anySuccess
      || results.some((result) => isProxyShapedFailure(result.error, manualProxy.url));

    if (proxyUnavailable) {
      options.log(`manual proxy unavailable; falling back to system: ${JSON.stringify(results)}`);
      await setSystemPolicy("manual_unavailable", manualProxy, "unavailable", results);
      return;
    }

    lastSuccessfulValidationAtMs = now();
    await setManualPolicy(manualProxy, lastSuccessfulValidationAtMs, "available", results);
  };

  const scheduleValidation = (manualProxy: ManualNetworkProxy) => {
    const epoch = ++validationEpoch;
    updateState({
      preferenceMode: "manual",
      configuredProxy: manualProxy,
      effectivePolicy: state.effectivePolicy,
      validationStatus: "validating",
      validationResults: [],
      updatedAtMs: now(),
    });
    void validateManualProxy(manualProxy, epoch).catch((error) => {
      if (epoch !== validationEpoch) {
        return;
      }
      options.log(`manual proxy validation failed: ${summarizeError(error)}`);
      void setSystemPolicy("manual_unavailable", manualProxy, "unavailable", []);
    });
  };

  const applyConfig = async () => {
    const config = await options.readConfigObject();
    const { preferenceMode, manualProxy } = resolveNetworkProxyConfig(config);

    if (preferenceMode !== "manual") {
      validationEpoch += 1;
      lastSuccessfulValidationAtMs = 0;
      await setSystemPolicy("user_system", null, "idle", []);
      return;
    }

    if (!manualProxy) {
      validationEpoch += 1;
      lastSuccessfulValidationAtMs = 0;
      await setSystemPolicy("invalid_manual", null, "invalid", [], "manual");
      return;
    }

    const previousManual = state.effectivePolicy.mode === "manual"
      ? state.effectivePolicy.proxyUrl
      : null;
    const validationFresh = previousManual === manualProxy.url
      && lastSuccessfulValidationAtMs > 0
      && now() - lastSuccessfulValidationAtMs < VALIDATION_FRESH_MS;
    const verifiedAtMs = validationFresh ? lastSuccessfulValidationAtMs : now();
    await setManualPolicy(manualProxy, verifiedAtMs, validationFresh ? "available" : "validating", []);
    if (!validationFresh) {
      scheduleValidation(manualProxy);
    }
  };

  return {
    async initializeFromConfig() {
      await applyConfig();
    },
    async reconfigureFromConfig() {
      await applyConfig();
    },
    getEffectivePolicy() {
      return state.effectivePolicy;
    },
    getState() {
      return state;
    },
    resolveProxyUrl() {
      return state.effectivePolicy.mode === "manual"
        ? state.effectivePolicy.proxyUrl
        : null;
    },
    markManualProxySuspect(signal: ProxyFailureSignal) {
      if (state.effectivePolicy.mode !== "manual") {
        return;
      }
      if (!isProxyShapedFailure(signal.reason, state.effectivePolicy.proxyUrl)) {
        return;
      }

      const manualProxy = state.configuredProxy;
      if (!manualProxy) {
        return;
      }

      options.log(`manual proxy suspect from ${signal.layer}: ${signal.reason}`);
      void setSystemPolicy("manual_unavailable", manualProxy, "validating", state.validationResults)
        .then(() => {
          scheduleValidation(manualProxy);
        })
        .catch((error) => {
          options.log(`failed to revalidate suspect manual proxy: ${summarizeError(error)}`);
        });
    },
  };
};
