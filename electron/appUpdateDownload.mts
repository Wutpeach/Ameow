import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

type DownloadFetch = (
  input: string,
  init?: {
    headers?: HeadersInit;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export type DownloadToFileProgress = {
  downloaded: number;
  total: number;
};

export type DownloadToFileOptions = {
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutErrorMessage?: string;
  fetch?: DownloadFetch;
  onProgress?(progress: DownloadToFileProgress): void;
};

export const buildGitHubHeaders = (): Record<string, string> => ({
  "User-Agent": "Ameow-Electron",
  Accept: "application/vnd.github+json, application/octet-stream",
});

const resolveFetch = (fetchOverride?: DownloadFetch): DownloadFetch => {
  if (fetchOverride) {
    return fetchOverride;
  }
  if (typeof globalThis.fetch !== "function") {
    throw new Error("Global fetch is unavailable in Electron main process");
  }
  return globalThis.fetch;
};

export const downloadToFile = async (
  url: string,
  destinationPath: string,
  options: DownloadToFileOptions = {},
): Promise<void> => {
  const configuredTimeoutMs = options.timeoutMs;
  const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs != null && configuredTimeoutMs > 0
    ? configuredTimeoutMs
    : null;
  const timeoutErrorMessage = options.timeoutErrorMessage
    ?? `Request timed out after ${Math.round((timeoutMs ?? 0) / 1000)}s`;
  const controller = timeoutMs ? new AbortController() : null;
  const upstreamSignal = options.signal;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  let removeAbortListener: (() => void) | null = null;
  let writable: ReturnType<typeof createWriteStream> | null = null;

  const resetTimeout = (): void => {
    if (!controller || !timeoutMs) {
      return;
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };

  if (controller && upstreamSignal) {
    const forwardAbort = (): void => {
      controller.abort(upstreamSignal.reason);
    };

    if (upstreamSignal.aborted) {
      controller.abort(upstreamSignal.reason);
    } else {
      upstreamSignal.addEventListener("abort", forwardAbort, { once: true });
      removeAbortListener = () => {
        upstreamSignal.removeEventListener("abort", forwardAbort);
      };
    }
  }

  try {
    resetTimeout();
    const response = await resolveFetch(options.fetch)(url, {
      headers: options.headers,
      signal: controller?.signal ?? upstreamSignal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    await mkdir(dirname(destinationPath), { recursive: true });

    const total = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
    writable = createWriteStream(destinationPath);
    const reader = response.body.getReader();
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      resetTimeout();
      const chunk = Buffer.from(value);
      downloaded += chunk.length;
      if (!writable.write(chunk)) {
        await once(writable, "drain");
      }
      options.onProgress?.({
        downloaded,
        total: Number.isFinite(total) ? total : 0,
      });
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    await new Promise<void>((resolveWrite, rejectWrite) => {
      writable?.once("error", rejectWrite);
      writable?.end(() => {
        resolveWrite();
      });
    });
  } catch (error) {
    writable?.destroy(error instanceof Error ? error : undefined);
    if (timedOut) {
      throw new Error(timeoutErrorMessage);
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    removeAbortListener?.();
  }
};
