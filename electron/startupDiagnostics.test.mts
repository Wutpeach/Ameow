import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStartupDiagnosticsController,
  summarizeCapturedImage,
} from "./startupDiagnostics.mjs";

type Listener = (...args: unknown[]) => void;

const tempDirs: string[] = [];

const createTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "ameow-startup-diagnostics-"));
  tempDirs.push(dir);
  return dir;
};

const createEmitter = () => {
  const listeners = new Map<string, Listener[]>();
  const add = (eventName: string, listener: Listener) => {
    listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener]);
  };
  return {
    on: add,
    once: add,
    emit(eventName: string, ...args: unknown[]) {
      for (const listener of listeners.get(eventName) ?? []) {
        listener(...args);
      }
    },
  };
};

const createFakeWindow = () => {
  const windowEmitter = createEmitter();
  const webContentsEmitter = createEmitter();
  return {
    windowEmitter,
    webContentsEmitter,
    win: {
      webContents: {
        id: 42,
        getURL: () => "app://main",
        capturePage: vi.fn(async () => ({
          getSize: () => ({ width: 1, height: 2 }),
          toBitmap: () => Buffer.from([0, 0, 0, 0, 0, 0, 0, 255]),
          toPNG: () => Buffer.from("png"),
        })),
        executeJavaScript: vi.fn(async () => ({ readyState: "complete" })),
        on: webContentsEmitter.on,
        once: webContentsEmitter.once,
      },
      getTitle: () => "Ameow",
      getBounds: () => ({ x: 1, y: 2, width: 3, height: 4 }),
      isVisible: () => true,
      isMinimized: () => false,
      isFocused: () => true,
      isAlwaysOnTop: () => true,
      isDestroyed: () => false,
      on: windowEmitter.on,
      once: windowEmitter.once,
    },
  };
};

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("summarizeCapturedImage", () => {
  it("summarizes alpha coverage from the captured bitmap", () => {
    expect(summarizeCapturedImage({
      getSize: () => ({ width: 2, height: 1 }),
      toBitmap: () => Buffer.from([0, 0, 0, 0, 0, 0, 0, 255]),
      toPNG: () => Buffer.from("png"),
    })).toEqual({
      width: 2,
      height: 1,
      pixelCount: 2,
      nonTransparentPixelCount: 1,
      nonTransparentRatio: 0.5,
      opaquePixelCount: 1,
      averageAlpha: 127.5,
    });
  });
});

describe("createStartupDiagnosticsController", () => {
  it("queues sectioned startup diagnostics when enabled", async () => {
    const logDir = await createTempDir();
    const diagnosticPath = join(logDir, "startup-diagnostics-latest.txt");
    const logInfo = vi.fn();
    const controller = createStartupDiagnosticsController({
      enabled: true,
      getStartupDiagnosticsPath: () => diagnosticPath,
      getStartupCapturePath: (label, phase) => join(logDir, `${label}-${phase}.png`),
      appendRuntimeLogLine: vi.fn(async () => undefined),
      logInfo,
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });

    await controller.queueStartupDiagnostic("WindowDiag", "main:show", { visible: true });

    await expect(readFile(diagnosticPath, "utf8")).resolves.toContain(
      "[2026-05-16T10:00:00.000Z] [WindowDiag] main:show {\"visible\":true}",
    );
    expect(logInfo).toHaveBeenCalledWith("WindowDiag", "main:show", "{\"visible\":true}");
  });

  it("captures renderer console messages into runtime and startup diagnostics", async () => {
    const logDir = await createTempDir();
    const appendRuntimeLogLine = vi.fn(async () => undefined);
    const { win, webContentsEmitter } = createFakeWindow();
    const controller = createStartupDiagnosticsController({
      enabled: true,
      getStartupDiagnosticsPath: () => join(logDir, "startup-diagnostics-latest.txt"),
      getStartupCapturePath: (label, phase) => join(logDir, `${label}-${phase}.png`),
      appendRuntimeLogLine,
      logInfo: vi.fn(),
    });

    controller.attachWindowStartupDiagnostics(win, "main");
    webContentsEmitter.emit("console-message", {
      level: "error",
      message: "renderer failed",
      lineNumber: 12,
      sourceId: "app.js",
    });

    expect(appendRuntimeLogLine).toHaveBeenCalledWith(
      "renderer",
      "[main] level=error renderer failed (app.js:12)",
    );
    await vi.waitFor(async () => {
      await expect(readFile(join(logDir, "startup-diagnostics-latest.txt"), "utf8")).resolves.toContain(
        "RendererConsole",
      );
    });
  });

  it("resolves renderer readiness through the pending webContents id", async () => {
    vi.useFakeTimers();
    const { win } = createFakeWindow();
    const controller = createStartupDiagnosticsController({
      enabled: false,
      getStartupDiagnosticsPath: () => "unused",
      getStartupCapturePath: () => "unused",
      appendRuntimeLogLine: vi.fn(async () => undefined),
      logInfo: vi.fn(),
      rendererReadyTimeoutMs: 1000,
    });

    const readyPromise = controller.waitForRendererReady(win, "main");
    expect(controller.resolveRendererReadySignal(42, { url: "app://main" })).toBe(true);
    await readyPromise;
  });
});
