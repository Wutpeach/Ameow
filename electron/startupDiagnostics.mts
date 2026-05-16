import {
  appendFile,
  writeFile,
} from "node:fs/promises";

type StartupDiagnosticsFs = {
  appendFile: typeof appendFile;
  writeFile: typeof writeFile;
};

type CapturedImage = {
  getSize(): { width: number; height: number };
  toBitmap(): Buffer;
  toPNG(): Buffer;
};

type WebContentsLike = {
  id: number;
  getURL(): string;
  capturePage(): Promise<CapturedImage>;
  executeJavaScript(script: string, userGesture?: boolean): Promise<unknown>;
  on(eventName: string, listener: (...args: unknown[]) => void): void;
  once(eventName: string, listener: (...args: unknown[]) => void): void;
};

type WindowLike = {
  webContents: WebContentsLike;
  getTitle(): string;
  getBounds(): unknown;
  isVisible(): boolean;
  isMinimized(): boolean;
  isFocused(): boolean;
  isAlwaysOnTop(): boolean;
  isDestroyed(): boolean;
  once(eventName: string, listener: (...args: unknown[]) => void): void;
  on(eventName: string, listener: (...args: unknown[]) => void): void;
};

export type StartupDiagnosticsControllerOptions = {
  enabled: boolean;
  getStartupDiagnosticsPath(): string;
  getStartupCapturePath(label: string, phase: string): string;
  appendRuntimeLogLine(level: string, message: unknown): Promise<unknown>;
  logInfo(scope: string, message: string, details?: string): void;
  rendererReadyTimeoutMs?: number;
  windowStartupCaptureDelayMs?: number;
  fs?: StartupDiagnosticsFs;
  now?(): Date;
};

const defaultFs: StartupDiagnosticsFs = {
  appendFile,
  writeFile,
};

const serializeDiagnosticPayload = (payload: unknown): string => {
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
};

const normalizeErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

export const summarizeCapturedImage = (image: CapturedImage) => {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  const pixelCount = width * height;
  let nonTransparentPixelCount = 0;
  let opaquePixelCount = 0;
  let alphaTotal = 0;

  for (let index = 3; index < bitmap.length; index += 4) {
    const alpha = bitmap[index];
    alphaTotal += alpha;
    if (alpha > 0) {
      nonTransparentPixelCount += 1;
    }
    if (alpha === 255) {
      opaquePixelCount += 1;
    }
  }

  return {
    width,
    height,
    pixelCount,
    nonTransparentPixelCount,
    nonTransparentRatio: pixelCount === 0
      ? 0
      : Number((nonTransparentPixelCount / pixelCount).toFixed(4)),
    opaquePixelCount,
    averageAlpha: pixelCount === 0
      ? 0
      : Number((alphaTotal / pixelCount).toFixed(2)),
  };
};

export const createStartupDiagnosticsController = (
  options: StartupDiagnosticsControllerOptions,
) => {
  const fsApi = options.fs ?? defaultFs;
  const rendererReadyTimeoutMs = options.rendererReadyTimeoutMs ?? 2500;
  const windowStartupCaptureDelayMs = options.windowStartupCaptureDelayMs ?? 180;
  const pendingRendererReadySignals = new Map<number, (payload?: unknown) => void>();
  let writeChain = Promise.resolve();

  const getWindowSnapshot = (win: WindowLike) => ({
    title: win.getTitle(),
    bounds: win.getBounds(),
    visible: win.isVisible(),
    minimized: win.isMinimized(),
    focused: win.isFocused(),
    alwaysOnTop: win.isAlwaysOnTop(),
    destroyed: win.isDestroyed(),
    url: win.webContents.getURL(),
  });

  const queueStartupDiagnostic = (scope: string, message: string, payload?: unknown) => {
    if (!options.enabled) {
      return Promise.resolve();
    }

    const serializedPayload = payload == null ? "" : serializeDiagnosticPayload(payload);
    const line = `[${(options.now?.() ?? new Date()).toISOString()}] [${scope}] ${message}${serializedPayload ? ` ${serializedPayload}` : ""}`;
    options.logInfo(scope, message, serializedPayload || undefined);
    writeChain = writeChain
      .catch(() => undefined)
      .then(async () => {
        try {
          await fsApi.appendFile(options.getStartupDiagnosticsPath(), `${line}\n`, "utf8");
        } catch (error) {
          console.error(">>> [StartupDiag] Failed to append diagnostic:", error);
        }
      });
    return writeChain;
  };

  const captureWindowStartupSurface = async (win: WindowLike, label: string, phase: string) => {
    if (!options.enabled || win.isDestroyed()) {
      return;
    }

    try {
      const image = await win.webContents.capturePage();
      const capturePath = options.getStartupCapturePath(label, phase);
      await fsApi.writeFile(capturePath, image.toPNG());
      await queueStartupDiagnostic("WindowDiag", `${label}:capture-${phase}`, {
        path: capturePath,
        summary: summarizeCapturedImage(image),
      });
    } catch (error) {
      await queueStartupDiagnostic("WindowDiag", `${label}:capture-${phase}-failed`, {
        error: normalizeErrorMessage(error),
      });
    }
  };

  const collectRendererStartupSnapshot = async (win: WindowLike, label: string, phase: string) => {
    if (!options.enabled || win.isDestroyed()) {
      return;
    }

    try {
      const snapshot = await win.webContents.executeJavaScript(
        `(() => {
          const root = document.getElementById("root");
          const body = document.body;
          const doc = document.documentElement;
          const rootStyle = root ? window.getComputedStyle(root) : null;
          const bodyStyle = body ? window.getComputedStyle(body) : null;
          const docStyle = doc ? window.getComputedStyle(doc) : null;
          const rect = root ? root.getBoundingClientRect() : null;

          return {
            href: window.location.href,
            readyState: document.readyState,
            visibilityState: document.visibilityState,
            bodyChildElementCount: body?.childElementCount ?? 0,
            rootChildElementCount: root?.childElementCount ?? 0,
            bodyHtmlLength: body?.innerHTML?.length ?? 0,
            rootHtmlLength: root?.innerHTML?.length ?? 0,
            bodyTextLength: body?.innerText?.length ?? 0,
            rootRect: rect
              ? {
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                }
              : null,
            docBackground: docStyle?.background ?? null,
            bodyBackground: bodyStyle?.background ?? null,
            rootBackground: rootStyle?.background ?? null,
            bodyOpacity: bodyStyle?.opacity ?? null,
            rootOpacity: rootStyle?.opacity ?? null,
            bodyVisibility: bodyStyle?.visibility ?? null,
            rootVisibility: rootStyle?.visibility ?? null,
            activeElementTag: document.activeElement?.tagName ?? null,
          };
        })()`,
        true,
      );
      await queueStartupDiagnostic("WindowDiag", `${label}:renderer-snapshot-${phase}`, snapshot);
    } catch (error) {
      await queueStartupDiagnostic("WindowDiag", `${label}:renderer-snapshot-${phase}-failed`, {
        error: normalizeErrorMessage(error),
      });
    }
  };

  const collectWindowStartupArtifacts = async (win: WindowLike, label: string, phase: string) => {
    if (!options.enabled || win.isDestroyed()) {
      return;
    }

    await new Promise((resolveDelay) => {
      setTimeout(resolveDelay, windowStartupCaptureDelayMs);
    });
    await collectRendererStartupSnapshot(win, label, phase);
    await captureWindowStartupSurface(win, label, phase);
  };

  const attachWindowStartupDiagnostics = (win: WindowLike, label: string) => {
    win.webContents.on("console-message", (details) => {
      const eventDetails = details as {
        level?: unknown;
        message?: unknown;
        lineNumber?: unknown;
        sourceId?: unknown;
      };
      void options.appendRuntimeLogLine(
        "renderer",
        `[${label}] level=${eventDetails.level} ${eventDetails.message} (${eventDetails.sourceId}:${eventDetails.lineNumber})`,
      );
      if (!options.enabled) {
        return;
      }
      void queueStartupDiagnostic("RendererConsole", `${label}:console-message`, {
        level: eventDetails.level,
        message: eventDetails.message,
        line: eventDetails.lineNumber,
        sourceId: eventDetails.sourceId,
      });
    });
    if (!options.enabled) {
      return;
    }
    win.webContents.once("dom-ready", () => {
      void queueStartupDiagnostic("WindowDiag", `${label}:dom-ready`, getWindowSnapshot(win));
    });
    win.once("ready-to-show", () => {
      void queueStartupDiagnostic("WindowDiag", `${label}:ready-to-show`, getWindowSnapshot(win));
    });
    win.once("show", () => {
      void queueStartupDiagnostic("WindowDiag", `${label}:show`, getWindowSnapshot(win));
    });
    win.once("hide", () => {
      void queueStartupDiagnostic("WindowDiag", `${label}:hide`, getWindowSnapshot(win));
    });
    win.webContents.once("did-finish-load", () => {
      void queueStartupDiagnostic("WindowDiag", `${label}:did-finish-load`, getWindowSnapshot(win));
    });
    win.webContents.once(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL) => {
        void queueStartupDiagnostic("WindowDiag", `${label}:did-fail-load`, {
          errorCode,
          errorDescription,
          validatedURL,
        });
      },
    );
    win.webContents.on("render-process-gone", (_event, details) => {
      void queueStartupDiagnostic("WindowDiag", `${label}:render-process-gone`, details);
    });
    win.on("unresponsive", () => {
      void queueStartupDiagnostic("WindowDiag", `${label}:unresponsive`, getWindowSnapshot(win));
    });
    win.on("responsive", () => {
      void queueStartupDiagnostic("WindowDiag", `${label}:responsive`, getWindowSnapshot(win));
    });
  };

  const waitForRendererReady = (win: WindowLike, label: string) => (
    new Promise<void>((resolveRendererReady) => {
      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (resolved) {
          return;
        }
        resolved = true;
        pendingRendererReadySignals.delete(win.webContents.id);
        void queueStartupDiagnostic("WindowDiag", `${label}:renderer-ready-timeout`, {
          timeoutMs: rendererReadyTimeoutMs,
        });
        resolveRendererReady();
      }, rendererReadyTimeoutMs);

      const finish = (payload?: unknown) => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timeoutId);
        pendingRendererReadySignals.delete(win.webContents.id);
        void queueStartupDiagnostic("WindowDiag", `${label}:renderer-ready`, payload ?? getWindowSnapshot(win));
        resolveRendererReady();
      };

      pendingRendererReadySignals.set(win.webContents.id, finish);

      if (win.isDestroyed()) {
        finish({
          reason: "window-destroyed-before-renderer-ready",
        });
        return;
      }

      win.once("closed", () => {
        finish({
          reason: "window-closed-before-renderer-ready",
        });
      });
    })
  );

  const resolveRendererReadySignal = (senderId: number, payload?: unknown) => {
    const resolveRendererReady = pendingRendererReadySignals.get(senderId);
    resolveRendererReady?.(payload);
    return Boolean(resolveRendererReady);
  };

  return {
    attachWindowStartupDiagnostics,
    collectWindowStartupArtifacts,
    getWindowSnapshot,
    queueStartupDiagnostic,
    resolveRendererReadySignal,
    waitForRendererReady,
  };
};
