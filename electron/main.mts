// @ts-nocheck
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray,
} from "electron";
import { existsSync } from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, parse, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";
import {
  buildWindowsAutostartSettings,
  getWindowsAutostartQuery,
  isWindowsAutostartEnabled,
} from "./autostart.mjs";
import {
  normalizeAppLanguage,
  resolveStartupLanguageFromConfig,
} from "./startupLanguage.mjs";
import {
  allocateRenameStem,
  createElectronDownloadRuntime,
  inspectRuntimeDependencyStatus,
  releaseRenameStem,
  resetRenameSequenceState,
  resolveXiaohongshuDragMedia,
  resolveRuntimeBinaryPaths,
  resolveRenameEnabled,
} from "../src/electron-runtime/index.js";
import { compareAppVersions } from "../src/updates/versioning.js";
import { createAppUpdateController } from "./appUpdateController.mjs";
import { checkYtdlpVersion as buildYtdlpVersionInfo, getGalleryDlInfo as buildGalleryDlInfo } from "./downloaderVersionInfo.mjs";
import {
  normalizeVideoCandidates,
  normalizeRequiredVideoRouteUrl,
  normalizeVideoPageUrl,
  normalizeVideoHintUrl,
  resolveVideoSelectionSiteHint,
} from "./videoHintNormalization.mjs";
import {
  VALIDATE_DROPPED_FOLDER_PATH_CHANNEL,
  validateDroppedFolderPath,
} from "./folderDrop.mjs";
import {
  getPackagedWindowRevealDelayMs,
  isPointInsideBounds,
  resolveMainWindowRevealBounds,
  resolvePackagedWindowsOpaqueWindowBackground,
  resolvePackagedWindowsTransparentWindowBackground,
  resolveWindowBoundsNearCursor,
  shouldEnablePackagedStartupDiagnostics,
  shouldUsePackagedWindowsOpaqueWindow,
} from "./windowVisibility.mjs";
import {
  buildStartupWindowModeArgument,
  resolveMainWindowStartupMode,
} from "./startupWindowMode.mjs";
import { waitForInitialWindowReveal } from "./windowRevealWait.mjs";
import { applyMacTrayAppMode } from "./macAppVisibility.mjs";
import { openPathOrThrow } from "./openPath.mjs";
import {
  ensureManagedYtDlpReady,
  getManagedYtDlpVersion,
} from "./managedYtDlpRuntime.mjs";
import {
  SETTINGS_WINDOW_CONTENT_HEIGHT,
  SETTINGS_WINDOW_CONTENT_WIDTH,
  UI_LAB_WINDOW_CONTENT_HEIGHT,
  UI_LAB_WINDOW_CONTENT_WIDTH,
  getMainWindowFullOuterSize,
  getMainWindowOuterSize,
  getSecondaryWindowOuterSize,
} from "../src/constants/windowMetrics.js";
import { createExtensionRequestBridge } from "./extensionRequestBridge.mjs";
import { createVideoDownloadCommandBridge } from "./videoDownloadCommands.mjs";
import {
  currentManagedRuntimeTarget,
  ensureManagedDenoRuntimeReady,
  ensureManagedFfmpegRuntimeReady,
  ensureManagedGalleryDlRuntimeReady,
  ensureManagedYtDlpRuntimeReady,
  resolvePinnedDownloaderRelease,
} from "./managedRuntimeBootstrap.mjs";
import { createRuntimeDependencyGateController } from "./runtimeDependencyGate.mjs";
import { createRuntimeLogController } from "./runtimeLog.mjs";
import { createStartupDiagnosticsController } from "./startupDiagnostics.mjs";
import { exportSupportLogFile } from "./supportLogExport.mjs";
import {
  buildUniqueTargetPath,
  downloadImage as saveDownloadedImage,
  ensureExtension,
  saveDataUrl as saveImageDataUrl,
} from "./imageDownload.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

const WINDOW_LABELS = {
  main: "main",
  settings: "settings",
  contextMenu: "context-menu",
  uiLab: "ui-lab",
};

const FALLBACK_LANGUAGE = "en";
const FALLBACK_THEME = "black";
const WS_PORT = 39527;
const DEFAULT_OUTPUT_FOLDER_NAME = "Ameow_Received";
const STARTUP_DIAGNOSTICS_FILE_NAME = "startup-diagnostics-latest.txt";
const SHORTCUT_SHOW_EVENT = "shortcut-show";
const SHORTCUT_TOGGLE_COOLDOWN_MS = 420;
const CONTEXT_MENU_CLOSED_EVENT = "context-menu-closed";
const LANGUAGE_CHANGED_EVENT = "language-changed";
const UI_LAB_RESET_EVENT = "ui-lab-reset";
const LOG_DIR_NAME = "logs";
const RUNTIME_LOG_FILE_NAME = "runtime-latest.log";
const RUNTIME_LOG_BUFFER_LIMIT = 1500;
const EXPORTED_RUNTIME_LOG_LINE_LIMIT = 800;
const SETTINGS_WINDOW_WIDTH = SETTINGS_WINDOW_CONTENT_WIDTH;
const SETTINGS_WINDOW_HEIGHT = SETTINGS_WINDOW_CONTENT_HEIGHT;
const SETTINGS_WINDOW_GAP = 16;
const UI_LAB_WINDOW_WIDTH = UI_LAB_WINDOW_CONTENT_WIDTH;
const UI_LAB_WINDOW_HEIGHT = UI_LAB_WINDOW_CONTENT_HEIGHT;
const UI_LAB_WINDOW_GAP = 16;
const WINDOW_EDGE_PADDING = 8;
const PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS = 15_000;
const XIAOHONGSHU_DRAG_RESOLUTION_TIMEOUT_MS = 30_000;
const XIAOHONGSHU_HIDDEN_DETAIL_POLL_ATTEMPTS = 7;
const XIAOHONGSHU_HIDDEN_DETAIL_POLL_INTERVAL_MS = 700;
const XIAOHONGSHU_HIDDEN_DETAIL_INITIAL_SETTLE_MS = 900;
const SHORT_LINK_NAVIGATION_TIMEOUT_MS = 12_000;
const SHORT_LINK_NAVIGATION_SETTLE_MS = 1_200;
const UI_LAB_VIDEO_QUEUE_MAX_CONCURRENT = 3;
const RENDERER_READY_TIMEOUT_MS = 2_500;
const WINDOW_STARTUP_CAPTURE_DELAY_MS = 180;
const STARTUP_DIAGNOSTIC_SETTINGS_OPEN_DELAY_MS = 1_500;
const MACOS_TRAY_ICON_SIZE_PX = 18;
let tray = null;
let registeredShortcut = "";
let lastShortcutTriggerMs = 0;
let electronDownloadRuntime = null;
let extensionRequestBridge = null;
let videoDownloadCommandBridge = null;
const appUpdateController = createAppUpdateController({
  platform: process.platform,
  isPackaged: app.isPackaged,
  getAppVersion() {
    return app.getVersion();
  },
  fetch: fetchWithDesktopSession,
  readConfigObject,
  compareAppVersions,
  normalizeVersionString,
  openPath(path) {
    return shell.openPath(path);
  },
  prepareToQuit() {
    app.isQuitting = true;
    app.quit();
  },
});
let nextOpaqueSequence = 1;
let hasShownMainWindowOnce = false;
let mainWindowUsesTransparentShell = false;

const windows = new Map();
const wsClients = new Set();
const pendingProtectedImageRequests = new Map();
const pendingXiaohongshuDragRequests = new Map();
let wsServer = null;
let uiLabRuntimeStatusOverride = null;
const runtimeDependencyGateController = createRuntimeDependencyGateController({
  emitAppEvent,
  getRuntimeDependencyStatus,
  buildManagedRuntimeBootstrapOptions,
  ensureManagedYtDlpRuntimeReady,
  ensureManagedGalleryDlRuntimeReady,
  ensureManagedFfmpegRuntimeReady,
  ensureManagedDenoRuntimeReady,
});
let uiLabScenarioActive = false;
const activeWindowBoundsAnimations = new Map();

const startupDiagnosticsEnabled = shouldEnablePackagedStartupDiagnostics({
  platform: process.platform,
  isPackaged: app.isPackaged,
  argv: process.argv,
  env: process.env,
});
const forceOpaquePackagedWindow = shouldUsePackagedWindowsOpaqueWindow({
  platform: process.platform,
  isPackaged: app.isPackaged,
  argv: process.argv,
  env: process.env,
});

function logInfo(scope, message, details) {
  if (details) {
    console.log(`>>> [${scope}] ${message}: ${details}`);
    return;
  }
  console.log(`>>> [${scope}] ${message}`);
}

function getStartupDiagnosticsPath() {
  return join(getLogsDir(), STARTUP_DIAGNOSTICS_FILE_NAME);
}

function getRuntimeLogPath() {
  return join(getLogsDir(), RUNTIME_LOG_FILE_NAME);
}

const runtimeLogController = createRuntimeLogController({
  getRuntimeLogPath,
  getAppVersion() {
    return app.getVersion();
  },
  platform: process.platform,
  arch: process.arch,
  isPackaged: app.isPackaged,
  bufferLimit: RUNTIME_LOG_BUFFER_LIMIT,
  exportedLineLimit: EXPORTED_RUNTIME_LOG_LINE_LIMIT,
});
const appendRuntimeLogLine = runtimeLogController.appendRuntimeLogLine;
const initializeRuntimeLogCapture = runtimeLogController.initializeRuntimeLogCapture;
const readRecentRuntimeLogLines = runtimeLogController.readRecentRuntimeLogLines;

function getStartupCapturePath(label, phase) {
  return join(getLogsDir(), `startup-capture-${label}-${phase}.png`);
}

const startupDiagnosticsController = createStartupDiagnosticsController({
  enabled: startupDiagnosticsEnabled,
  getStartupDiagnosticsPath,
  getStartupCapturePath,
  appendRuntimeLogLine,
  logInfo,
  rendererReadyTimeoutMs: RENDERER_READY_TIMEOUT_MS,
  windowStartupCaptureDelayMs: WINDOW_STARTUP_CAPTURE_DELAY_MS,
});
const attachWindowStartupDiagnostics = startupDiagnosticsController.attachWindowStartupDiagnostics;
const collectWindowStartupArtifacts = startupDiagnosticsController.collectWindowStartupArtifacts;
const getWindowSnapshot = startupDiagnosticsController.getWindowSnapshot;
const queueStartupDiagnostic = startupDiagnosticsController.queueStartupDiagnostic;
const waitForRendererReady = startupDiagnosticsController.waitForRendererReady;

function serializeDiagnosticPayload(payload) {
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

async function delayTransparentPackagedWindowReveal(label, transparentWindow) {
  const revealDelayMs = getPackagedWindowRevealDelayMs({
    platform: process.platform,
    isPackaged: app.isPackaged,
    transparentWindow,
  });

  if (revealDelayMs <= 0) {
    return;
  }

  void queueStartupDiagnostic("WindowDiag", `${label}:reveal-delay`, {
    delayMs: revealDelayMs,
  });
  await new Promise((resolveDelay) => {
    setTimeout(resolveDelay, revealDelayMs);
  });
}

type AmeowWindowAppearanceOptions = {
  allowTransparency?: boolean;
  currentTheme: string;
  preferZeroAlphaTransparentBackground?: boolean;
};

type AmeowBrowserWindowCreationOptions = {
  routePath: string;
  width: number;
  height: number;
  startupWindowMode?: "compact" | "full";
  x?: number;
  y?: number;
  center?: boolean;
  title?: string;
  allowTransparency?: boolean;
  frame?: boolean;
  resizable?: boolean;
  alwaysOnTop?: boolean;
  skipTaskbar?: boolean;
  parentLabel?: string;
  preferZeroAlphaTransparentBackground?: boolean;
};

function resolveWindowAppearance({
  allowTransparency = true,
  currentTheme,
  preferZeroAlphaTransparentBackground = false,
}: AmeowWindowAppearanceOptions) {
  const transparentWindow = allowTransparency && !forceOpaquePackagedWindow;
  const backgroundColor = transparentWindow && process.platform === "win32" && app.isPackaged
    ? resolvePackagedWindowsTransparentWindowBackground(
      currentTheme,
      preferZeroAlphaTransparentBackground,
    )
    : !transparentWindow && process.platform === "win32" && app.isPackaged
      ? resolvePackagedWindowsOpaqueWindowBackground(currentTheme)
      : "#00000000";

  return {
    transparentWindow,
    backgroundColor,
    useOpaquePackagedWindow: !transparentWindow && process.platform === "win32" && app.isPackaged,
  };
}

async function createAmeowBrowserWindow(label: string, {
  routePath,
  width,
  height,
  startupWindowMode = "full",
  x,
  y,
  center = false,
  title,
  allowTransparency = true,
  frame = false,
  resizable = false,
  alwaysOnTop = true,
  skipTaskbar = process.platform === "win32",
  parentLabel,
  preferZeroAlphaTransparentBackground = false,
}: AmeowBrowserWindowCreationOptions, startupConfigSnapshot = null) {
  const preloadPath = join(__dirname, "preload.mjs");
  const iconPath = getIconPath();
  const currentTheme = startupConfigSnapshot?.theme ?? await readCurrentTheme();
  const {
    transparentWindow,
    backgroundColor,
    useOpaquePackagedWindow,
  } = resolveWindowAppearance({
    allowTransparency,
    currentTheme,
    preferZeroAlphaTransparentBackground,
  });
  const useNativeWindowShadow = process.platform === "darwin" ? false : !transparentWindow;

  const browserWindow = new BrowserWindow({
    width,
    height,
    x: typeof x === "number" ? Math.round(x) : undefined,
    y: typeof y === "number" ? Math.round(y) : undefined,
    center,
    title,
    transparent: transparentWindow,
    backgroundColor,
    frame,
    resizable,
    alwaysOnTop,
    icon: iconPath ?? undefined,
    skipTaskbar,
    parent: parentLabel ? getWindow(parentLabel) ?? undefined : undefined,
    hasShadow: useNativeWindowShadow,
    roundedCorners: process.platform === "win32",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      additionalArguments: [
        buildStartupWindowModeArgument(startupWindowMode),
      ],
    },
  });

  void queueStartupDiagnostic("WindowDiag", `${label}:create-options`, {
    route: buildRendererRoute(routePath),
    useOpaquePackagedWindow,
    transparentWindow,
    options: {
      transparent: transparentWindow,
      backgroundColor,
      skipTaskbar,
      show: false,
      alwaysOnTop,
      frame,
      hasShadow: useNativeWindowShadow,
      roundedCorners: process.platform === "win32",
    },
  });

  registerWindow(label, browserWindow);
  attachWindowStartupDiagnostics(browserWindow, label);

  return {
    browserWindow,
    transparentWindow,
  };
}

async function waitForWindowReadyToReveal(
  win: BrowserWindow,
  label: string,
  transparentWindow: boolean,
  {
    awaitRendererReady = true,
  }: {
    awaitRendererReady?: boolean;
  } = {},
) {
  const initialRevealReady = waitForInitialWindowReveal(win);
  const rendererReadyPromise = awaitRendererReady
    ? waitForRendererReady(win, label)
    : Promise.resolve();

  await initialRevealReady;
  await rendererReadyPromise;
  await delayTransparentPackagedWindowReveal(label, transparentWindow);
}

function applyMainWindowVisibleZOrder(win: BrowserWindow, reason: string) {
  if (win.isDestroyed()) {
    return;
  }

  if (process.platform === "win32") {
    const level = app.isPackaged && mainWindowUsesTransparentShell
      ? "screen-saver"
      : "floating";
    win.setAlwaysOnTop(true, level);
    if (app.isPackaged && mainWindowUsesTransparentShell) {
      win.moveTop();
    }
    void queueStartupDiagnostic("WindowDiag", `main:z-order-${reason}`, {
      level,
      transparentShell: mainWindowUsesTransparentShell,
      snapshot: getWindowSnapshot(win),
    });
    return;
  }

  win.setAlwaysOnTop(true);
}

function clampWindowBoundsValue(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.round(numeric);
}

function easeInOutCubic(progress: number) {
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped < 0.5) {
    return 4 * (clamped ** 3);
  }
  return 1 - (((-2 * clamped) + 2) ** 3) / 2;
}

function stopWindowBoundsAnimation(win: BrowserWindow) {
  const activeAnimation = activeWindowBoundsAnimations.get(win.id);
  if (!activeAnimation) {
    return;
  }
  activeAnimation.stop();
  activeWindowBoundsAnimations.delete(win.id);
}

async function animateBrowserWindowBounds(
  win: BrowserWindow,
  targetBounds: { x: number; y: number; width: number; height: number },
  {
    durationMs = 280,
  }: {
    durationMs?: number;
  } = {},
) {
  if (win.isDestroyed()) {
    return;
  }

  stopWindowBoundsAnimation(win);

  const from = win.getBounds();
  const to = {
    x: clampWindowBoundsValue(targetBounds.x, from.x),
    y: clampWindowBoundsValue(targetBounds.y, from.y),
    width: Math.max(1, clampWindowBoundsValue(targetBounds.width, from.width)),
    height: Math.max(1, clampWindowBoundsValue(targetBounds.height, from.height)),
  };
  const effectiveDurationMs = Math.max(0, Number(durationMs) || 0);

  if (
    effectiveDurationMs === 0
    || (
      from.x === to.x
      && from.y === to.y
      && from.width === to.width
      && from.height === to.height
    )
  ) {
    win.setBounds(to, false);
    return;
  }

  await new Promise<void>((resolve) => {
    const startedAtMs = Date.now();
    let frameTimer: NodeJS.Timeout | null = null;
    let stopped = false;

    const finish = () => {
      if (frameTimer !== null) {
        clearTimeout(frameTimer);
        frameTimer = null;
      }
      if (activeWindowBoundsAnimations.get(win.id)?.stop === stop) {
        activeWindowBoundsAnimations.delete(win.id);
      }
      if (!win.isDestroyed()) {
        win.setBounds(to, false);
      }
      resolve();
    };

    const step = () => {
      if (stopped) {
        resolve();
        return;
      }
      if (win.isDestroyed()) {
        if (frameTimer !== null) {
          clearTimeout(frameTimer);
          frameTimer = null;
        }
        if (activeWindowBoundsAnimations.get(win.id)?.stop === stop) {
          activeWindowBoundsAnimations.delete(win.id);
        }
        resolve();
        return;
      }

      const elapsedMs = Date.now() - startedAtMs;
      const progress = Math.min(1, elapsedMs / effectiveDurationMs);
      const easedProgress = easeInOutCubic(progress);
      win.setBounds({
        x: Math.round(from.x + ((to.x - from.x) * easedProgress)),
        y: Math.round(from.y + ((to.y - from.y) * easedProgress)),
        width: Math.round(from.width + ((to.width - from.width) * easedProgress)),
        height: Math.round(from.height + ((to.height - from.height) * easedProgress)),
      }, false);

      if (progress >= 1) {
        finish();
        return;
      }

      frameTimer = setTimeout(step, 1000 / 60);
    };

    const stop = () => {
      stopped = true;
      if (frameTimer !== null) {
        clearTimeout(frameTimer);
        frameTimer = null;
      }
      resolve();
    };

    activeWindowBoundsAnimations.set(win.id, { stop });
    step();
  });
}

function getDesktopNetworkSession() {
  if (!app.isReady()) {
    return null;
  }
  return session.defaultSession ?? null;
}

// Use Chromium's network stack so main-process downloads inherit session/system proxy settings.
async function fetchWithDesktopSession(input, init = {}) {
  const activeSession = getDesktopNetworkSession();
  if (activeSession?.fetch) {
    return activeSession.fetch(input, init);
  }
  if (typeof globalThis.fetch !== "function") {
    throw new Error("Global fetch is unavailable in Electron main process");
  }
  return globalThis.fetch(input, init);
}

async function fetchWithDesktopSessionTimeout(
  input,
  init = {},
  timeoutMs,
  timeoutMessage,
) {
  if (!timeoutMs || timeoutMs <= 0) {
    return fetchWithDesktopSession(input, init);
  }

  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let timeoutId = null;
  let timedOut = false;
  let removeAbortListener = null;

  if (upstreamSignal) {
    const forwardAbort = () => {
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

  timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchWithDesktopSession(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    removeAbortListener?.();
  }
}

function parseJsonObject(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function nowTimestampMs() {
  return Date.now();
}

function getUserDataDir() {
  return app.getPath("userData");
}

function getConfigPath() {
  return join(getUserDataDir(), "settings.json");
}

function getLogsDir() {
  return join(getUserDataDir(), LOG_DIR_NAME);
}

async function migrateLegacyConfigIfNeeded() {
  return;
}

async function ensureUserDataDirs() {
  await migrateLegacyConfigIfNeeded();
  await mkdir(getUserDataDir(), { recursive: true });
  await mkdir(getLogsDir(), { recursive: true });
}

async function readConfigString() {
  await ensureUserDataDirs();
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return "{}";
  }

  const configRaw = await readFile(configPath, "utf8");
  const decision = resolveStartupLanguageFromConfig(configRaw, app.getLocale(), {
    persistResolvedLanguage: true,
  });
  if (decision.nextConfigRaw && decision.nextConfigRaw !== configRaw) {
    await writeFile(configPath, decision.nextConfigRaw, "utf8");
    return decision.nextConfigRaw;
  }

  return configRaw;
}

async function readConfigObject() {
  return parseJsonObject(await readConfigString());
}

function resolveLanguageFromConfigString(raw) {
  return resolveStartupLanguageFromConfig(raw, app.getLocale(), {
    persistResolvedLanguage: false,
  }).language;
}

async function readCurrentLanguage() {
  return resolveLanguageFromConfigString(await readConfigString());
}

function resolveThemeFromConfigObject(config) {
  return config.theme === "white" || config.theme === "black"
    ? config.theme
    : FALLBACK_THEME;
}

function resolveExtensionInjectionDebugEnabledFromConfigObject(config) {
  return config.extensionInjectionDebugEnabled === true;
}

function summarizeInjectedVideoSelectionPayload(payload) {
  const normalizedTitle = normalizeOptionalString(payload?.title);
  const normalizedCookies = normalizeOptionalString(payload?.cookies);
  const normalizedSiteHint = resolveVideoSelectionSiteHint(
    payload?.siteHint,
    payload?.pageUrl,
    payload?.url,
    payload?.videoUrl,
  );
  const normalizedVideoCandidates = normalizeVideoCandidates(
    payload?.videoCandidates,
    normalizedSiteHint,
  );
  const rawExtensionData = (
    payload?.extensionData && typeof payload.extensionData === "object" && !Array.isArray(payload.extensionData)
      ? payload.extensionData
      : payload?.extension_data && typeof payload.extension_data === "object" && !Array.isArray(payload.extension_data)
        ? payload.extension_data
        : null
  );
  const rawYouTubeExtensionData = rawExtensionData?.youtube
    && typeof rawExtensionData.youtube === "object"
    && !Array.isArray(rawExtensionData.youtube)
    ? rawExtensionData.youtube
    : null;
  const youtubeExtensionSource = normalizeOptionalString(rawYouTubeExtensionData?.source);
  const normalizedExtensionData = rawYouTubeExtensionData
    ? {
        youtube: {
          forceExtended: typeof rawYouTubeExtensionData.forceExtended === "boolean"
            ? rawYouTubeExtensionData.forceExtended
            : null,
          allowCookies: typeof rawYouTubeExtensionData.allowCookies === "boolean"
            ? rawYouTubeExtensionData.allowCookies
            : null,
          source:
            youtubeExtensionSource === "injected"
            || youtubeExtensionSource === "pasted"
            || youtubeExtensionSource === "context_menu"
              ? youtubeExtensionSource
              : null,
        },
      }
    : null;

  return {
    requestId: normalizeOptionalString(payload?.requestId) ?? null,
    url: normalizeRequiredVideoRouteUrl(payload?.url),
    pageUrl: normalizeVideoPageUrl(payload?.pageUrl),
    videoUrl: normalizeVideoHintUrl(payload?.videoUrl, normalizedSiteHint),
    selectionScope:
      payload?.selectionScope === "current_item" || payload?.selectionScope === "playlist"
        ? payload.selectionScope
        : null,
    siteHint: normalizedSiteHint ?? null,
    titlePresent: Boolean(normalizedTitle),
    cookiesPresent: Boolean(normalizedCookies),
    extensionData: normalizedExtensionData,
    videoCandidateCount: normalizedVideoCandidates.length,
    clipStartSec: normalizeOptionalNumber(payload?.clipStartSec ?? payload?.clip_start_sec) ?? null,
    clipEndSec: normalizeOptionalNumber(payload?.clipEndSec ?? payload?.clip_end_sec) ?? null,
    ytdlpQualityPreference:
      normalizeYtdlpQualityPreference(payload?.ytdlpQualityPreference)
      ?? normalizeYtdlpQualityPreference(payload?.ytdlpQuality)
      ?? normalizeYtdlpQualityPreference(payload?.defaultVideoDownloadQuality)
      ?? null,
  };
}

function logInjectedVideoSelectionDebug(config, message, payload) {
  if (!resolveExtensionInjectionDebugEnabledFromConfigObject(config)) {
    return;
  }

  logInfo("InjectedVideoSelection", message, serializeDiagnosticPayload(payload));
}

async function readCurrentTheme() {
  return resolveThemeFromConfigObject(await readConfigObject());
}

function buildStartupConfigSnapshot(configRaw) {
  const config = parseJsonObject(configRaw);
  return {
    raw: configRaw,
    config,
    language: resolveLanguageFromConfigString(configRaw),
    theme: resolveThemeFromConfigObject(config),
    shortcut: typeof config.shortcut === "string" ? config.shortcut.trim() : "",
  };
}

async function readStartupConfigSnapshot() {
  return buildStartupConfigSnapshot(await readConfigString());
}

async function saveConfigString(raw) {
  await ensureUserDataDirs();
  const previousLanguage = await readCurrentLanguage();
  const previousConfig = await readConfigObject();
  const previousExtensionInjectionDebugEnabled =
    resolveExtensionInjectionDebugEnabledFromConfigObject(previousConfig);
  await writeFile(getConfigPath(), raw, "utf8");

  const nextConfig = parseJsonObject(raw);
  const nextLanguage = normalizeAppLanguage(nextConfig.language);
  if (nextLanguage && nextLanguage !== previousLanguage) {
    emitAppEvent(LANGUAGE_CHANGED_EVENT, { language: nextLanguage });
    broadcastWsMessage({
      action: "language_changed",
      data: {
        language: nextLanguage,
      },
    });
    updateTrayMenu().catch((error) => {
      console.error(">>> [Electron] Failed to refresh tray language:", error);
    });
  }

  const nextExtensionInjectionDebugEnabled =
    resolveExtensionInjectionDebugEnabledFromConfigObject(nextConfig);
  if (nextExtensionInjectionDebugEnabled !== previousExtensionInjectionDebugEnabled) {
    broadcastWsMessage({
      action: "extension_debug_config_changed",
      data: {
        enabled: nextExtensionInjectionDebugEnabled,
      },
    });
  }
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeHttpUrl(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizeOptionalNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function nextOpaqueId(prefix) {
  const safePrefix = normalizeOptionalString(prefix) ?? "electron";
  const identifier = `${safePrefix}-${Date.now()}-${nextOpaqueSequence}`;
  nextOpaqueSequence += 1;
  return identifier;
}

function buildCookieHeaderFromNetscape(rawCookies) {
  const cookies = normalizeOptionalString(rawCookies);
  if (!cookies) {
    return null;
  }

  const pairs = [];
  for (const line of cookies.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const parts = trimmed.split("\t");
    if (parts.length < 7) {
      continue;
    }

    const name = normalizeOptionalString(parts[5]);
    if (!name) {
      continue;
    }

    pairs.push(`${name}=${parts[6] ?? ""}`);
  }

  return pairs.length > 0 ? pairs.join("; ") : null;
}

function parseNetscapeCookies(rawCookies) {
  const cookies = normalizeOptionalString(rawCookies);
  if (!cookies) {
    return [];
  }

  const parsedCookies = [];
  for (const line of cookies.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const parts = trimmed.split("\t");
    if (parts.length < 7) {
      continue;
    }

    const domain = normalizeOptionalString(parts[0]);
    const path = normalizeOptionalString(parts[2]) ?? "/";
    const secure = String(parts[3] ?? "").toUpperCase() === "TRUE";
    const expirationRaw = Number(parts[4]);
    const name = normalizeOptionalString(parts[5]);
    if (!domain || !name) {
      continue;
    }

    const hostname = domain.replace(/^\./, "");
    if (!hostname) {
      continue;
    }

    parsedCookies.push({
      url: `${secure ? "https" : "http"}://${hostname}${path.startsWith("/") ? path : `/${path}`}`,
      domain,
      path,
      secure,
      expirationDate: Number.isFinite(expirationRaw) && expirationRaw > 0
        ? expirationRaw
        : undefined,
      name,
      value: typeof parts[6] === "string" ? parts[6] : "",
    });
  }

  return parsedCookies;
}

async function seedSessionCookiesFromNetscape(targetSession, rawCookies) {
  const cookies = parseNetscapeCookies(rawCookies);
  if (cookies.length === 0) {
    return 0;
  }

  await Promise.allSettled(
    cookies.map((cookie) => targetSession.cookies.set(cookie)),
  );
  return cookies.length;
}

function buildXiaohongshuHiddenDetailUrls(pageUrl, noteId, sourcePageUrl, detailUrl) {
  const urls = [];
  const seen = new Set();

  const addUrl = (value) => {
    const normalized = normalizeVideoPageUrl(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    urls.push(normalized);
  };

  addUrl(detailUrl);
  addUrl(sourcePageUrl);
  addUrl(pageUrl);
  const normalizedNoteId = normalizeOptionalString(noteId);
  if (normalizedNoteId) {
    addUrl(`https://www.xiaohongshu.com/explore/${normalizedNoteId}`);
  }

  return urls;
}

function isXiaohongshuNotePageUrl(value) {
  const normalized = normalizeVideoPageUrl(value);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return /(?:^|\.)(xiaohongshu\.com|xhslink\.com)$/i.test(parsed.hostname)
      && /\/(?:explore|discovery\/item)\/[a-zA-Z0-9]+|^\/user\/profile\/[^/?#]+\/[a-zA-Z0-9]+(?:[/?#]|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function resolveUrlViaHiddenNavigation(targetUrl) {
  const normalizedTargetUrl = normalizeVideoPageUrl(targetUrl);
  if (!normalizedTargetUrl) {
    return undefined;
  }

  const partition = `ameow-short-link-${nextOpaqueId("partition")}`;
  const hiddenWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 960,
    frame: false,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      partition,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  hiddenWindow.setMenuBarVisibility(false);
  hiddenWindow.webContents.setAudioMuted(true);
  hiddenWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  let lastNavigatedUrl = normalizedTargetUrl;
  let settledTimer = null;
  let timeoutTimer = null;

  try {
    const resolutionPromise = new Promise((resolveFinal) => {
      let finished = false;

      const resolveOnce = (value) => {
        if (finished) {
          return;
        }
        finished = true;
        if (settledTimer) {
          clearTimeout(settledTimer);
          settledTimer = null;
        }
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        resolveFinal(value);
      };

      const scheduleResolve = () => {
        if (settledTimer) {
          clearTimeout(settledTimer);
        }
        settledTimer = setTimeout(async () => {
          try {
            const liveUrl = hiddenWindow.isDestroyed()
              ? lastNavigatedUrl
              : hiddenWindow.webContents.getURL() || lastNavigatedUrl;
            resolveOnce(liveUrl);
          } catch {
            resolveOnce(lastNavigatedUrl);
          }
        }, SHORT_LINK_NAVIGATION_SETTLE_MS);
      };

      const handleNavigation = (_event, url) => {
        if (typeof url === "string" && url.trim()) {
          lastNavigatedUrl = url.trim();
        }
        scheduleResolve();
      };

      hiddenWindow.webContents.on("did-redirect-navigation", handleNavigation);
      hiddenWindow.webContents.on("did-navigate", handleNavigation);
      hiddenWindow.webContents.on("did-frame-navigate", handleNavigation);
      hiddenWindow.webContents.on("did-stop-loading", scheduleResolve);
      hiddenWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
        console.warn(">>> [ShortLink] Hidden navigation failed:", JSON.stringify({
          targetUrl: normalizedTargetUrl,
          errorCode,
          errorDescription,
          validatedURL,
          lastNavigatedUrl,
        }));
        resolveOnce(lastNavigatedUrl);
      });

      timeoutTimer = setTimeout(() => {
        console.warn(">>> [ShortLink] Hidden navigation timed out:", JSON.stringify({
          targetUrl: normalizedTargetUrl,
          lastNavigatedUrl,
        }));
        resolveOnce(lastNavigatedUrl);
      }, SHORT_LINK_NAVIGATION_TIMEOUT_MS);
    });

    await hiddenWindow.loadURL(normalizedTargetUrl, {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    }).catch((error) => {
      console.warn(">>> [ShortLink] Hidden navigation loadURL failed:", JSON.stringify({
        targetUrl: normalizedTargetUrl,
        error: error instanceof Error ? error.message : String(error),
      }));
    });
    const finalUrl = await resolutionPromise;

    logInfo("ShortLink", "Hidden navigation resolved", JSON.stringify({
      targetUrl: normalizedTargetUrl,
      finalUrl,
    }));
    return normalizeVideoPageUrl(finalUrl) ?? finalUrl;
  } catch (error) {
    console.warn(">>> [ShortLink] Hidden navigation resolver threw:", error);
    return undefined;
  } finally {
    if (settledTimer) {
      clearTimeout(settledTimer);
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
    if (!hiddenWindow.isDestroyed()) {
      hiddenWindow.destroy();
    }
    try {
      const hiddenSession = session.fromPartition(partition);
      await hiddenSession.clearStorageData();
    } catch {
      // Ignore cleanup failures for ephemeral hidden sessions.
    }
  }
}

function isUsableXiaohongshuDirectVideoUrl(value) {
  const normalized = normalizeVideoHintUrl(value, "xiaohongshu");
  if (!normalized) {
    return false;
  }

  return /xhscdn\.com/i.test(normalized)
    && /\.(mp4|m4v|mov|m3u8)(?:[?#]|$)/i.test(normalized);
}

function hasUsableXiaohongshuVideoMedia(media) {
  if (!media || typeof media !== "object") {
    return false;
  }

  return isUsableXiaohongshuDirectVideoUrl(media.videoUrl)
    || normalizeVideoCandidates(media.videoCandidates, "xiaohongshu").some((candidate) => (
      isUsableXiaohongshuDirectVideoUrl(candidate?.url)
    ));
}

function shouldAttemptXiaohongshuHiddenDetailResolution({
  pageUrl,
  detailUrl,
  noteId,
  mediaType,
  videoIntentConfidence,
  resolvedMedia,
}) {
  if (
    !normalizeVideoPageUrl(pageUrl)
    && !normalizeVideoPageUrl(detailUrl)
    && !normalizeOptionalString(noteId)
  ) {
    return false;
  }

  if (hasUsableXiaohongshuVideoMedia(resolvedMedia)) {
    return false;
  }

  const resolvedConfidence =
    typeof resolvedMedia?.videoIntentConfidence === "number"
      ? resolvedMedia.videoIntentConfidence
      : 0;
  const normalizedDetailUrl = normalizeVideoPageUrl(detailUrl);
  const hasTokenizedDetailUrl = Boolean(
    normalizedDetailUrl && /[?&]xsec_token=/i.test(normalizedDetailUrl),
  );

  return mediaType === "video"
    || resolvedMedia?.kind === "video"
    || videoIntentConfidence >= 0.7
    || resolvedConfidence >= 0.7
    || ((videoIntentConfidence >= 0.5 || resolvedConfidence >= 0.5) && hasTokenizedDetailUrl);
}

function extractXiaohongshuHiddenPageMediaPageContext(options) {
  const normalizeString = (value) => (
    typeof value === "string" && value.trim() ? value.trim() : null
  );

  const normalizeNoteId = (value) => {
    const normalized = normalizeString(value);
    return normalized && /^[a-zA-Z0-9]+$/.test(normalized) ? normalized : null;
  };

  const normalizeUrl = (value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.replace(/\\u002F/gi, "/").replace(/\\\//g, "/").trim();
    if (!trimmed || /^(?:blob:|data:|file:|about:|javascript:|mailto:)/i.test(trimmed)) {
      return null;
    }

    try {
      const normalized = new URL(trimmed, window.location.href).toString();
      return /^https?:\/\//i.test(normalized) ? normalized : null;
    } catch {
      return null;
    }
  };

  const isUsableDirectVideoUrl = (value) => {
    const normalized = normalizeUrl(value);
    if (!normalized) {
      return false;
    }

    return /xhscdn\.com/i.test(normalized)
      && /\.(?:mp4|m4v|mov|m3u8)(?:[?#]|$)/i.test(normalized);
  };

  const isLikelyVideoUrl = (value) => {
    const normalized = normalizeUrl(value);
    if (!normalized) {
      return false;
    }

    if (/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|css|js|json|txt|woff2?|ttf)(?:[?#]|$)/i.test(normalized)) {
      return false;
    }

    return isUsableDirectVideoUrl(normalized);
  };

  const normalizeImageUrl = (value) => {
    const normalized = normalizeUrl(value);
    if (
      !normalized
      || isLikelyVideoUrl(normalized)
      || /\.(?:css|js|json|txt|map|woff2?|ttf)(?:[?#]|$)/i.test(normalized)
    ) {
      return null;
    }

    if (
      !/sns-webpic[^/]*\.xhscdn\.com/i.test(normalized)
      && !/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(normalized)
      && !/(?:imageView2|format\/(?:jpe?g|png|webp|gif)|notes_pre_post|!nc_)/i.test(normalized)
    ) {
      return null;
    }

    return normalized;
  };

  const isErrorLikePage = () => {
    const href = String(window.location.href || "");
    const bodyText = String(document.body?.innerText || "");
    const titleText = String(document.title || "");

    return /\/website-login\/|\/404(?:[/?#]|$)/i.test(href)
      || /error_code=300017|error_code=300031/i.test(href)
      || /访问链接异常|当前笔记暂时无法浏览/i.test(bodyText)
      || /访问链接异常|暂时无法浏览|404/i.test(titleText);
  };

  const resolveImageUrlCandidate = (value) => normalizeImageUrl(value);

  const classifyCandidateType = (value) => {
    const normalized = String(value || "").toLowerCase();
    if (/\.m3u8(?:[?#]|$)/i.test(normalized)) {
      return "manifest_m3u8";
    }
    if (/xhscdn\.com/i.test(normalized) && /\.(?:mp4|m4v|mov)(?:[?#]|$)/i.test(normalized)) {
      return "direct_cdn";
    }
    if (/\.mp4(?:[?#]|$)/i.test(normalized)) {
      return "direct_mp4";
    }
    return "indirect_media";
  };

  const candidateTypeScore = (type) => {
    switch (type) {
      case "direct_cdn":
        return 100;
      case "direct_mp4":
        return 90;
      case "indirect_media":
        return 45;
      case "manifest_m3u8":
        return 10;
      default:
        return 0;
    }
  };

  const sourceScore = (source) => {
    switch (source) {
      case "hidden_video_element":
        return 20;
      case "hidden_video_source":
        return 18;
      case "hidden_performance_resource":
        return 10;
      case "hidden_script_scan":
        return 6;
      case "hidden_initial_state":
      case "hidden_initial_state_origin_video_key":
        return 18;
      default:
        return 0;
    }
  };

  const confidenceForScore = (score) => {
    if (score >= 110) {
      return "high";
    }
    if (score >= 70) {
      return "medium";
    }
    return "low";
  };

  const videoCandidates = [];
  const imageCandidates = [];
  const seenVideoUrls = new Set();
  const seenImageUrls = new Set();

  const addVideoCandidate = (rawUrl, source) => {
    let candidateUrl = rawUrl;
    if (typeof candidateUrl === "string" && !/^https?:\/\//i.test(candidateUrl) && /\.mp4(?:$|\?)/i.test(candidateUrl)) {
      candidateUrl = `https://sns-video-bd.xhscdn.com/${candidateUrl.replace(/^\/+/, "")}`;
    }

    const normalized = normalizeUrl(candidateUrl);
    if (!normalized || seenVideoUrls.has(normalized) || !isLikelyVideoUrl(normalized)) {
      return;
    }

    seenVideoUrls.add(normalized);
    const type = classifyCandidateType(normalized);
    const score = candidateTypeScore(type) + sourceScore(source);
    videoCandidates.push({
      url: normalized,
      type,
      confidence: confidenceForScore(score),
      source,
      mediaType: "video",
      score,
    });
  };

  const addImageCandidate = (rawUrl, source) => {
    const normalized = resolveImageUrlCandidate(rawUrl);
    if (!normalized || seenImageUrls.has(normalized)) {
      return;
    }

    seenImageUrls.add(normalized);
    imageCandidates.push({
      url: normalized,
      source,
    });
  };

  const valueSuggestsVideoNote = (value, seen = new WeakSet(), depth = 0) => {
    if (value == null || depth > 12) {
      return false;
    }

    if (typeof value === "string") {
      return /^video$/i.test(value.trim())
        || /(?:^|["'{,\s])(?:type|note_?type)["']?\s*[:=]\s*["']video["']/i.test(value)
        || /hasVideo["']?\s*[:=]\s*true/i.test(value)
        || /master[_-]?url/i.test(value)
        || /stream\/[A-Za-z0-9_-]+/i.test(value);
    }

    if (Array.isArray(value)) {
      return value.some((entry) => valueSuggestsVideoNote(entry, seen, depth + 1));
    }

    if (typeof value !== "object") {
      return false;
    }

    if (seen.has(value)) {
      return false;
    }
    seen.add(value);

    return Object.entries(value).some(([key, entry]) => {
      if ((/^type$|note_?type/i.test(key)) && typeof entry === "string") {
        return /^video$/i.test(entry.trim());
      }
      if (/hasVideo/i.test(key) && entry === true) {
        return true;
      }
      if (/^video$|video[_-]?(?:info|media|consumer|id)/i.test(key) && entry != null) {
        return true;
      }
      if (/master[_-]?url|stream|h26[45]|originVideoKey/i.test(key) && entry != null) {
        return true;
      }
      return valueSuggestsVideoNote(entry, seen, depth + 1);
    });
  };

  const collectMediaFromValue = (value, seen = new WeakSet(), depth = 0) => {
    if (value == null || depth > 12) {
      return;
    }

    if (typeof value === "string") {
      addVideoCandidate(value, "hidden_initial_state");
      addImageCandidate(value, "hidden_initial_state");
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => collectMediaFromValue(entry, seen, depth + 1));
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    if (typeof value.originVideoKey === "string") {
      addVideoCandidate(value.originVideoKey, "hidden_initial_state_origin_video_key");
    }

    Object.values(value).forEach((entry) => collectMediaFromValue(entry, seen, depth + 1));
  };

  const extractStateEntries = (rootValue, expectedNoteId) => {
    const matches = [];
    const visit = (value, seen = new WeakSet(), depth = 0) => {
      if (value == null || depth > 12) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => visit(entry, seen, depth + 1));
        return;
      }
      if (typeof value !== "object") {
        return;
      }
      if (seen.has(value)) {
        return;
      }
      seen.add(value);

      const candidateIds = [
        value.noteCard?.note?.noteId,
        value.noteCard?.note?.id,
        value.noteCard?.noteId,
        value.noteCard?.id,
        value.note?.noteId,
        value.note?.id,
        value.noteId,
        value.id,
      ];
      if (expectedNoteId && candidateIds.some((candidate) => normalizeNoteId(candidate) === expectedNoteId)) {
        matches.push(value);
      }

      Object.values(value).forEach((entry) => visit(entry, seen, depth + 1));
    };

    visit(rootValue);
    return matches;
  };

  const extractPrimaryImageUrl = () => {
    const metaSelectors = [
      'meta[property="og:image"]',
      'meta[name="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="twitter:image"]',
    ];
    for (const selector of metaSelectors) {
      const metaImage = document.querySelector(selector)?.getAttribute("content");
      const resolved = resolveImageUrlCandidate(metaImage);
      if (resolved) {
        return resolved;
      }
    }

    const images = Array.from(document.querySelectorAll("img"));
    for (const image of images) {
      const resolved = resolveImageUrlCandidate(image.currentSrc)
        || resolveImageUrlCandidate(image.src)
        || resolveImageUrlCandidate(image.getAttribute("src"))
        || resolveImageUrlCandidate(image.getAttribute("data-src"));
      if (resolved) {
        return resolved;
      }
    }

    return null;
  };

  const normalizedExpectedNoteId = normalizeNoteId(options?.noteId);
  const initialState = window.__INITIAL_STATE__ && typeof window.__INITIAL_STATE__ === "object"
    ? window.__INITIAL_STATE__
    : null;
  const matchedStateEntries = initialState
    ? extractStateEntries(initialState, normalizedExpectedNoteId)
    : [];

  if (matchedStateEntries.length > 0) {
    matchedStateEntries.forEach((entry) => collectMediaFromValue(entry));
  } else if (initialState) {
    collectMediaFromValue(initialState);
  }

  const videos = Array.from(document.querySelectorAll("video"));
  for (const video of videos) {
    addVideoCandidate(video.currentSrc, "hidden_video_element");
    addVideoCandidate(video.src, "hidden_video_element");
    addVideoCandidate(video.getAttribute("src"), "hidden_video_element");
    const source = video.querySelector("source");
    addVideoCandidate(source?.src, "hidden_video_source");
    addVideoCandidate(source?.getAttribute("src"), "hidden_video_source");
  }

  const resources = performance.getEntriesByType("resource") || [];
  for (let index = resources.length - 1; index >= 0; index -= 1) {
    addVideoCandidate(resources[index]?.name, "hidden_performance_resource");
  }

  const scriptTags = Array.from(document.querySelectorAll("script"));
  const urlRegex = /https?:\/\/[^\s"'\\]+/g;
  for (const script of scriptTags) {
    const rawText = script.textContent || "";
    if (!rawText) {
      continue;
    }
    const text = rawText.replace(/\\u002F/g, "/");
    const matches = text.match(urlRegex) || [];
    for (const match of matches) {
      addVideoCandidate(match, "hidden_script_scan");
      addImageCandidate(match, "hidden_script_scan");
    }
  }

  const playTarget = document.querySelector(
    '.play-icon, [class*="play-icon"], [class*="video-play"], [class*="play-btn"], [class*="player-btn"], button[aria-label*="play"], button[aria-label*="播放"]',
  );
  let clickedPlay = false;
  if (videoCandidates.length === 0 && playTarget && !window.__AMEOW_XHS_HIDDEN_PLAY_CLICKED__) {
    window.__AMEOW_XHS_HIDDEN_PLAY_CLICKED__ = true;
    clickedPlay = true;
    const clickable = playTarget.closest("button, [role='button'], div") || playTarget;
    ["pointerdown", "mousedown", "mouseup", "click"].forEach((eventName) => {
      clickable.dispatchEvent(new MouseEvent(eventName, {
        bubbles: true,
        cancelable: true,
        view: window,
      }));
    });
  }

  const orderedVideoCandidates = videoCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ score, ...candidate }) => candidate);
  const errorLikePage = isErrorLikePage();
  const filteredVideoCandidates = errorLikePage
    ? []
    : orderedVideoCandidates.filter((candidate) => isUsableDirectVideoUrl(candidate?.url));
  const imageUrl = imageCandidates[0]?.url
    || extractPrimaryImageUrl()
    || resolveImageUrlCandidate(options?.preferredImageUrl)
    || null;

  const videoIntentSources = [];
  let videoIntentConfidence = 0;

  if (matchedStateEntries.length > 0) {
    videoIntentConfidence = 1;
    videoIntentSources.push("hidden_detail_state_note");
  } else if (initialState && valueSuggestsVideoNote(initialState)) {
    videoIntentConfidence = Math.max(videoIntentConfidence, 0.85);
    videoIntentSources.push("hidden_detail_state_scan");
  }

  if (videos.length > 0) {
    videoIntentConfidence = Math.max(videoIntentConfidence, 0.95);
    videoIntentSources.push("hidden_detail_video_element");
  }

  if (playTarget) {
    videoIntentConfidence = Math.max(videoIntentConfidence, 0.7);
    videoIntentSources.push("hidden_detail_play_button");
  }

  if (orderedVideoCandidates.length > 0) {
    videoIntentConfidence = 1;
    videoIntentSources.push("hidden_detail_video_candidates");
  }

  const normalizedPageUrl = normalizeUrl(window.location.href)
    || normalizeUrl(options?.pageUrl)
    || null;
  const loginRedirect =
    /\/website-login\//i.test(window.location.href)
    || /error_code=300017/i.test(document.body?.innerText || "");
  const noteUnavailable = errorLikePage && !loginRedirect;

  return {
    kind:
      filteredVideoCandidates.length > 0 || (videoIntentConfidence >= 0.7 && !errorLikePage)
        ? "video"
        : imageUrl
          ? "image"
          : "unknown",
    pageUrl: normalizedPageUrl,
    imageUrl,
    videoUrl: filteredVideoCandidates[0]?.url || null,
    videoCandidates: filteredVideoCandidates,
    videoIntentConfidence: Math.round(videoIntentConfidence * 1000) / 1000,
    videoIntentSources: Array.from(new Set(videoIntentSources)),
    pending: !errorLikePage && !loginRedirect && filteredVideoCandidates.length === 0 && videoIntentConfidence >= 0.7,
    clickedPlay,
    loginRedirect,
    noteUnavailable,
    errorLikePage,
    documentReadyState: document.readyState,
    title: document.title || null,
  };
}

async function resolveXiaohongshuViaHiddenDetailPage({
  pageUrl,
  noteId,
  imageUrl,
  cookies,
  sourcePageUrl,
  detailUrl,
  videoIntentConfidence = 0,
  videoIntentSources = [],
}) {
  const targetUrls = buildXiaohongshuHiddenDetailUrls(pageUrl, noteId, sourcePageUrl, detailUrl);
  if (targetUrls.length === 0) {
    return null;
  }

  const cookieHeader = buildCookieHeaderFromNetscape(cookies);

  for (const targetUrl of targetUrls) {
    const partition = `ameow-xiaohongshu-hidden-${nextOpaqueId("partition")}`;
    const hiddenSession = session.fromPartition(partition, { cache: false });
    const hiddenWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 960,
      frame: false,
      skipTaskbar: true,
      transparent: false,
      backgroundColor: "#ffffff",
      webPreferences: {
        partition,
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
      },
    });

    hiddenWindow.setMenuBarVisibility(false);
    hiddenWindow.webContents.setAudioMuted(true);
    hiddenWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    try {
      const seededCookieCount = await seedSessionCookiesFromNetscape(hiddenSession, cookies);
      logInfo("Xiaohongshu", "Opening hidden detail page fallback", JSON.stringify({
        targetUrl,
        noteId: normalizeOptionalString(noteId),
        cookiesPresent: Boolean(cookieHeader),
        seededCookieCount,
      }));

      await hiddenWindow.loadURL(targetUrl, {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        extraHeaders: [
          `Referer: ${targetUrl}`,
          cookieHeader ? `Cookie: ${cookieHeader}` : null,
        ].filter(Boolean).join("\n"),
      });

      await new Promise((resolveDelay) => {
        setTimeout(resolveDelay, XIAOHONGSHU_HIDDEN_DETAIL_INITIAL_SETTLE_MS);
      });

      let pendingResult = null;
      for (let attempt = 0; attempt < XIAOHONGSHU_HIDDEN_DETAIL_POLL_ATTEMPTS; attempt += 1) {
        const extracted = await hiddenWindow.webContents.executeJavaScript(
          `(${extractXiaohongshuHiddenPageMediaPageContext.toString()})(${JSON.stringify({
            noteId: normalizeOptionalString(noteId),
            pageUrl: targetUrl,
            preferredImageUrl: normalizeHttpUrl(imageUrl),
          })})`,
          true,
        );

        const orderedCandidates = normalizeVideoCandidates(extracted?.videoCandidates, "xiaohongshu");
        const resolvedVideoUrl = normalizeVideoHintUrl(extracted?.videoUrl, "xiaohongshu")
          ?? orderedCandidates[0]?.url
          ?? undefined;
        const resolvedPageUrl = isXiaohongshuNotePageUrl(extracted?.pageUrl)
          ? extracted.pageUrl
          : targetUrl;
        const normalizedResult = {
          kind: extracted?.kind === "video" || extracted?.kind === "image"
            ? extracted.kind
            : "unknown",
          pageUrl: normalizeVideoPageUrl(resolvedPageUrl) ?? targetUrl,
          imageUrl: normalizeHttpUrl(extracted?.imageUrl) ?? normalizeHttpUrl(imageUrl),
          videoUrl: resolvedVideoUrl ?? null,
          videoCandidates: orderedCandidates,
          videoIntentConfidence:
            typeof extracted?.videoIntentConfidence === "number"
              ? extracted.videoIntentConfidence
              : videoIntentConfidence,
          videoIntentSources: Array.isArray(extracted?.videoIntentSources)
            ? Array.from(new Set([
                ...videoIntentSources,
                ...extracted.videoIntentSources,
              ].filter((value) => typeof value === "string" && value.trim())))
            : videoIntentSources,
          pending: extracted?.pending === true,
          loginRedirect: extracted?.loginRedirect === true,
          noteUnavailable: extracted?.noteUnavailable === true,
          errorLikePage: extracted?.errorLikePage === true,
          clickedPlay: extracted?.clickedPlay === true,
        };

        logInfo("Xiaohongshu", "Hidden detail page probe", JSON.stringify({
          targetUrl,
          attempt: attempt + 1,
          kind: normalizedResult.kind,
          pageUrl: normalizedResult.pageUrl,
          videoUrl: normalizedResult.videoUrl,
          videoCandidatesCount: normalizedResult.videoCandidates.length,
          videoIntentConfidence: normalizedResult.videoIntentConfidence ?? null,
          videoIntentSources: normalizedResult.videoIntentSources ?? [],
          pending: normalizedResult.pending === true,
          loginRedirect: normalizedResult.loginRedirect === true,
          noteUnavailable: normalizedResult.noteUnavailable === true,
          errorLikePage: normalizedResult.errorLikePage === true,
          clickedPlay: normalizedResult.clickedPlay === true,
        }));

        if (hasUsableXiaohongshuVideoMedia(normalizedResult)) {
          return {
            kind: "video",
            pageUrl: normalizedResult.pageUrl,
            imageUrl: normalizedResult.imageUrl ?? null,
            videoUrl: normalizedResult.videoUrl,
            videoCandidates: normalizedResult.videoCandidates,
            videoIntentConfidence: normalizedResult.videoIntentConfidence ?? videoIntentConfidence ?? null,
            videoIntentSources: normalizedResult.videoIntentSources ?? videoIntentSources,
          };
        }

        pendingResult = normalizedResult;
        if (normalizedResult.loginRedirect !== true && normalizedResult.pending === true) {
          await new Promise((resolveDelay) => {
            setTimeout(resolveDelay, XIAOHONGSHU_HIDDEN_DETAIL_POLL_INTERVAL_MS);
          });
          continue;
        }

        break;
      }

      if (pendingResult) {
        logInfo("Xiaohongshu", "Hidden detail page did not expose a direct video URL", JSON.stringify({
          targetUrl,
          kind: pendingResult.kind,
          pageUrl: pendingResult.pageUrl,
          videoIntentConfidence: pendingResult.videoIntentConfidence ?? null,
          videoIntentSources: pendingResult.videoIntentSources ?? [],
          loginRedirect: pendingResult.loginRedirect === true,
          noteUnavailable: pendingResult.noteUnavailable === true,
          errorLikePage: pendingResult.errorLikePage === true,
        }));
      }
    } catch (error) {
      logInfo(
        "Xiaohongshu",
        "Hidden detail page fallback failed",
        JSON.stringify({
          targetUrl,
          noteId: normalizeOptionalString(noteId),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      hiddenWindow.destroy();
      await hiddenSession.clearStorageData().catch(() => {});
    }
  }

  return null;
}

function normalizeSelectionScope(value) {
  return value === "current_item" || value === "playlist" ? value : "auto";
}

function normalizeYtdlpQualityPreference(value) {
  switch (value) {
    case "best":
      return "best";
    case "balanced":
    case "high":
      return "balanced";
    case "data_saver":
    case "standard":
      return "data_saver";
    default:
      return null;
  }
}

function resolveVideoDownloadPreferencesFromConfig(config) {
  return {
    ytdlpQuality:
      normalizeYtdlpQualityPreference(
        normalizeOptionalString(config.defaultVideoDownloadQuality)
          ?? normalizeOptionalString(config.ytdlpQualityPreference),
      )
      ?? "best",
    aeFriendlyConversionEnabled: config.aeFriendlyConversionEnabled === true,
  };
}

async function syncIncomingDownloadPreferences(data) {
  const incomingQuality = normalizeYtdlpQualityPreference(
    normalizeOptionalString(data?.ytdlpQualityPreference)
      ?? normalizeOptionalString(data?.defaultVideoDownloadQuality),
  );
  const incomingAeFriendly = typeof data?.aeFriendlyConversionEnabled === "boolean"
    ? data.aeFriendlyConversionEnabled
    : null;

  if (!incomingQuality && incomingAeFriendly == null) {
    return null;
  }

  const config = await readConfigObject();
  if (incomingQuality) {
    config.defaultVideoDownloadQuality = incomingQuality;
  }
  if (incomingAeFriendly != null) {
    config.aeFriendlyConversionEnabled = incomingAeFriendly;
  }
  await saveConfigString(JSON.stringify(config));

  const merged = resolveVideoDownloadPreferencesFromConfig(config);
  return {
    quality: merged.ytdlpQuality,
    aeFriendlyConversionEnabled: merged.aeFriendlyConversionEnabled,
  };
}

function buildVideoTaskLabel(task) {
  return normalizeOptionalString(task.title)
    ?? normalizeOptionalString(task.pageUrl)
    ?? normalizeOptionalString(task.url)
    ?? task.traceId;
}

async function buildRenamedTargetPath(targetDir, extension, config) {
  await mkdir(targetDir, { recursive: true });
  const safeExtension = ensureExtension(extension);
  const stem = await allocateRenameStem(targetDir, config);

  return {
    stem,
    filePath: join(targetDir, `${stem}.${safeExtension}`),
  };
}

async function resolveCurrentOutputFolderPath() {
  const config = await readConfigObject();
  if (typeof config.outputPath === "string" && config.outputPath.trim()) {
    return config.outputPath.trim();
  }
  return join(app.getPath("desktop"), DEFAULT_OUTPUT_FOLDER_NAME);
}

const imageDownloadDependencies = {
  readConfigObject,
  resolveCurrentOutputFolderPath,
  resolveRenameEnabled,
  buildRenamedTargetPath,
  releaseRenameStem,
  requestProtectedImageResolution,
  fetchWithDesktopSession,
  logInfo,
};

async function processFiles(paths, targetDir) {
  const finalTargetDir = targetDir || (await resolveCurrentOutputFolderPath());
  await mkdir(finalTargetDir, { recursive: true });
  const config = await readConfigObject();
  const renameEnabled = resolveRenameEnabled(config);

  let copiedCount = 0;
  for (const sourcePath of paths) {
    if (typeof sourcePath !== "string" || !sourcePath.trim()) {
      continue;
    }

    let sourceStats;
    try {
      sourceStats = await stat(sourcePath);
    } catch {
      continue;
    }

    const sourceName = basename(sourcePath);
    const stem = parse(sourceName).name;
    const extension = ensureExtension(extname(sourceName), "bin");

    if (sourceStats.isDirectory()) {
      const destinationPath = await buildUniqueTargetPath(finalTargetDir, stem, extension);
      await cp(sourcePath, destinationPath.replace(/\.[^.]+$/, ""), { recursive: true });
    } else {
      let renamedStem = null;
      try {
        if (renameEnabled) {
          const renamedTarget = await buildRenamedTargetPath(finalTargetDir, extension, config);
          renamedStem = renamedTarget.stem;
          await copyFile(sourcePath, renamedTarget.filePath);
        } else {
          const destinationPath = await buildUniqueTargetPath(finalTargetDir, stem, extension);
          await copyFile(sourcePath, destinationPath);
        }
      } finally {
        if (renamedStem) {
          releaseRenameStem(finalTargetDir, renamedStem);
        }
      }
    }
    copiedCount += 1;
  }

  return `Copied ${copiedCount} files to ${finalTargetDir}`;
}

function parseClipboardFileNameBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return [];
  }

  const decoded = buffer.toString("utf16le");
  return decoded
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function getClipboardFilePaths() {
  const availableFormats = clipboard.availableFormats();
  if (availableFormats.includes("FileNameW")) {
    return parseClipboardFileNameBuffer(clipboard.readBuffer("FileNameW"));
  }
  if (availableFormats.includes("FileName")) {
    return clipboard
      .readBuffer("FileName")
      .toString("utf8")
      .split("\u0000")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

async function exportSupportLog() {
  return exportSupportLogFile({
    environment: {
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      configPath: getConfigPath(),
      logDir: getLogsDir(),
      runtimeLogPath: getRuntimeLogPath(),
    },
    readConfigObject,
    getRuntimeDependencyStatus,
    readRecentRuntimeLogLines,
  });
}

function resolveBundledBinary(toolId) {
  const binaries = resolveRuntimeBinaryPaths(buildElectronRuntimeEnvironment());
  const candidate = toolId === "gallery-dl" ? binaries.galleryDl : binaries.ytDlp;
  return existsSync(candidate) ? candidate : null;
}

function buildElectronRuntimeEnvironment() {
  return {
    repoRoot,
    configDir: getUserDataDir(),
    resourceDir: app.isPackaged ? join(process.resourcesPath, "desktop-assets") : null,
    executableDir: dirname(process.execPath),
    desktopDir: app.getPath("desktop"),
    tempDir: tmpdir(),
    platform: process.platform,
    arch: process.arch,
    fetch: fetchWithDesktopSession,
    resolveUrlViaNavigation: resolveUrlViaHiddenNavigation,
  };
}

function buildManagedRuntimeBootstrapOptions(_missingComponents = [], onActivity = null) {
  return {
    configDir: getUserDataDir(),
    platform: process.platform,
    arch: process.arch,
    fetch: fetchWithDesktopSession,
    log(message) {
      logInfo("Electron", message);
    },
    onActivity,
  };
}

function getElectronDownloadRuntime() {
  if (electronDownloadRuntime) {
    return electronDownloadRuntime;
  }

  electronDownloadRuntime = createElectronDownloadRuntime({
    environment: buildElectronRuntimeEnvironment(),
    configStore: {
      readConfigString,
    },
    eventSink: {
      emit(event, payload) {
        emitAppEvent(event, payload);
      },
    },
    logger: {
      log(message) {
        logInfo("ElectronRuntime", message);
      },
    },
    bootstrapManagedComponents: async ({ reason }) => {
      await ensureMissingManagedRuntimesReady(reason || "electron_runtime");
      return getRuntimeDependencyStatus();
    },
  });
  return electronDownloadRuntime;
}

function getExtensionRequestBridge() {
  if (extensionRequestBridge) {
    return extensionRequestBridge;
  }

  extensionRequestBridge = createExtensionRequestBridge({
    getConnectedClientCount() {
      return wsClients.size;
    },
    broadcast(message) {
      broadcastWsMessage(message);
    },
    nextRequestId(prefix) {
      return nextOpaqueId(prefix);
    },
    log(message, details) {
      console.log(`>>> [PastedVideo] ${message}:`, JSON.stringify(details ?? null));
    },
  });
  return extensionRequestBridge;
}

function getVideoDownloadCommandBridge() {
  if (videoDownloadCommandBridge) {
    return videoDownloadCommandBridge;
  }

  videoDownloadCommandBridge = createVideoDownloadCommandBridge({
    runtime: getElectronDownloadRuntime(),
    extensionBridge: getExtensionRequestBridge(),
    readConfigObject,
    getRuntimeDependencyStatus,
    getRuntimeDependencyGateState,
    refreshRuntimeDependencyGateState,
    startRuntimeDependencyBootstrap,
    checkYtdlpVersion,
    getGalleryDlInfo,
    logInjectedDebug: logInjectedVideoSelectionDebug,
  });
  return videoDownloadCommandBridge;
}

function readyRuntimeEntry(entryPath, source) {
  return {
    state: "ready",
    source,
    path: entryPath,
    error: null,
  };
}

function missingRuntimeEntry(error) {
  return {
    state: "missing",
    source: null,
    path: null,
    error,
  };
}

function isUiLabEnabled() {
  return !app.isPackaged;
}

function assertUiLabEnabled() {
  if (!isUiLabEnabled()) {
    throw new Error("UI Lab is only available in development builds.");
  }
}

function cloneRuntimeStatusSnapshot(snapshot) {
  return {
    ytDlp: { ...snapshot.ytDlp },
    galleryDl: { ...snapshot.galleryDl },
    ffmpeg: { ...snapshot.ffmpeg },
    deno: { ...snapshot.deno },
  };
}

function cloneRuntimeDependencyGateState(state) {
  return {
    phase: state.phase,
    missingComponents: [...(state.missingComponents ?? [])],
    lastError: state.lastError ?? null,
    updatedAtMs: state.updatedAtMs ?? nowTimestampMs(),
    currentComponent: state.currentComponent ?? null,
    currentStage: state.currentStage ?? null,
    progressPercent: state.progressPercent ?? null,
    downloadedBytes: state.downloadedBytes ?? null,
    totalBytes: state.totalBytes ?? null,
    nextComponent: state.nextComponent ?? null,
  };
}

function clearUiLabRuntimeOverrides() {
  uiLabRuntimeStatusOverride = null;
  runtimeDependencyGateController.clearUiLabRuntimeGateOverride();
}

function setUiLabRuntimeOverrides(runtimeStatus, gateState) {
  uiLabRuntimeStatusOverride = cloneRuntimeStatusSnapshot(runtimeStatus);
  runtimeDependencyGateController.setUiLabRuntimeGateOverride(
    cloneRuntimeDependencyGateState(gateState),
  );
}

async function getRuntimeDependencyStatus() {
  if (uiLabRuntimeStatusOverride) {
    return cloneRuntimeStatusSnapshot(uiLabRuntimeStatusOverride);
  }

  return inspectRuntimeDependencyStatus(buildElectronRuntimeEnvironment());
}

async function getRuntimeDependencyGateState() {
  return runtimeDependencyGateController.getState();
}

async function refreshRuntimeDependencyGateState() {
  return runtimeDependencyGateController.refreshState();
}

async function ensureMissingManagedRuntimesReady(trigger) {
  return runtimeDependencyGateController.ensureMissingManagedRuntimesReady(trigger);
}

async function startRuntimeDependencyBootstrap(reason = "frontend_after_visible") {
  return runtimeDependencyGateController.startBootstrap(reason);
}

function normalizeVersionString(value) {
  const normalized = normalizeOptionalString(value)?.replace(/^v/i, "");
  return normalized ?? null;
}

function compareLooseVersions(left, right) {
  const leftParts = String(left)
    .split(/[.\-+_]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const rightParts = String(right)
    .split(/[.\-+_]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const width = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < width; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }
  return 0;
}

async function getLocalDownloaderVersion(toolId, binaryPath) {
  return new Promise((resolveVersion, rejectVersion) => {
    const child = spawn(binaryPath, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", rejectVersion);
    child.once("close", (code) => {
      if (code === 0) {
        const firstLine = `${stdout}\n${stderr}`
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean);
        resolveVersion(normalizeVersionString(firstLine) ?? "unknown");
        return;
      }
      rejectVersion(new Error(stderr.trim() || `${toolId} exited with code ${code}`));
    });
  });
}

async function checkYtdlpVersion() {
  return buildYtdlpVersionInfo({
    platform: process.platform,
    getRuntimeDependencyStatus,
    getUserDataDir,
    currentManagedRuntimeTarget,
    getManagedYtDlpVersion,
    getLocalDownloaderVersion,
    resolvePinnedDownloaderRelease,
    compareLooseVersions,
  });
}

async function getGalleryDlInfo() {
  return buildGalleryDlInfo({
    platform: process.platform,
    getRuntimeDependencyStatus,
    getLocalDownloaderVersion,
    resolvePinnedDownloaderRelease,
    compareLooseVersions,
  });
}

function readNativeLocaleCandidates(language) {
  const candidates = [
    join(repoRoot, "locales", language, "native.json"),
    join(process.resourcesPath, "locales", language, "native.json"),
  ];
  return candidates.filter((candidate) => !candidate.includes("app.asar"));
}

async function loadNativeLocaleDocument(language) {
  for (const candidate of readNativeLocaleCandidates(language)) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const raw = await readFile(candidate, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      console.error(">>> [Electron] Failed to read native locale:", error);
    }
  }
  return null;
}

async function loadTrayLabels(language) {
  const normalizedLanguage = normalizeAppLanguage(language) ?? FALLBACK_LANGUAGE;
  const primary = await loadNativeLocaleDocument(normalizedLanguage);
  const fallback = normalizedLanguage === FALLBACK_LANGUAGE
    ? null
    : await loadNativeLocaleDocument(FALLBACK_LANGUAGE);
  const fromDocument = (document, path) => {
    let current = document;
    for (const key of path) {
      current = current?.[key];
    }
    return typeof current === "string" ? current : null;
  };
  return {
    show: fromDocument(primary, ["tray", "show"])
      || fromDocument(fallback, ["tray", "show"])
      || "Show Window",
    settings: fromDocument(primary, ["tray", "settings"])
      || fromDocument(fallback, ["tray", "settings"])
      || "Settings",
    quit: fromDocument(primary, ["tray", "quit"])
      || fromDocument(fallback, ["tray", "quit"])
      || "Quit Ameow",
  };
}

function getIconPath() {
  const candidates = process.platform === "win32"
    ? [
        join(repoRoot, "desktop-assets", "icons", "icon.ico"),
        join(repoRoot, "app-icon.png"),
        join(repoRoot, "public", "favicon.ico"),
      ]
    : [
        join(repoRoot, "app-icon.png"),
        join(repoRoot, "public", "favicon.ico"),
      ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function createTrayImage() {
  const iconPath = getIconPath();
  if (!iconPath) {
    return nativeImage.createEmpty();
  }

  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    return nativeImage.createEmpty();
  }

  if (process.platform !== "darwin") {
    return image;
  }

  return image.resize({
    height: MACOS_TRAY_ICON_SIZE_PX,
    width: MACOS_TRAY_ICON_SIZE_PX,
  });
}

function emitAppEvent(event, payload) {
  for (const win of windows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send(`ameow:event:${event}`, { payload });
    }
  }
}

function createUiLabReadyRuntimeStatus() {
  return {
    ytDlp: readyRuntimeEntry("D:/ui-lab/yt-dlp.exe", "bundled"),
    galleryDl: readyRuntimeEntry("D:/ui-lab/gallery-dl.exe", "bundled"),
    ffmpeg: readyRuntimeEntry("D:/ui-lab/ffmpeg.exe", "managed"),
    deno: readyRuntimeEntry("D:/ui-lab/deno.exe", "managed"),
  };
}

function createUiLabMissingRuntimeStatus() {
  const readyStatus = createUiLabReadyRuntimeStatus();
  return {
    ...readyStatus,
    ffmpeg: missingRuntimeEntry("Missing managed ffmpeg runtime. UI Lab preview."),
    deno: missingRuntimeEntry("Missing managed deno runtime. UI Lab preview."),
  };
}

function createUiLabReadyRuntimeGateState() {
  return {
    phase: "ready",
    missingComponents: [],
    lastError: null,
    updatedAtMs: nowTimestampMs(),
    currentComponent: null,
    currentStage: null,
    progressPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    nextComponent: null,
  };
}

function applyUiLabRuntimePreview(runtimeStatus, gateState) {
  setUiLabRuntimeOverrides(runtimeStatus, gateState);
  emitAppEvent("runtime-dependency-gate-state", gateState);
}

function applyUiLabReadyRuntimePreview() {
  applyUiLabRuntimePreview(
    createUiLabReadyRuntimeStatus(),
    createUiLabReadyRuntimeGateState(),
  );
}

function emitUiLabEmptyTaskState() {
  emitAppEvent("video-queue-count", {
    activeCount: 0,
    pendingCount: 0,
    totalCount: 0,
    maxConcurrent: getElectronDownloadRuntime().maxConcurrent ?? UI_LAB_VIDEO_QUEUE_MAX_CONCURRENT,
  });
  emitAppEvent("video-queue-detail", { tasks: [] });
  emitAppEvent("video-transcode-queue-count", {
    activeCount: 0,
    pendingCount: 0,
    failedCount: 0,
    totalCount: 0,
    maxConcurrent: 1,
  });
  emitAppEvent("video-transcode-queue-detail", { tasks: [] });
}

function emitLiveVideoQueueState() {
  const runtime = getElectronDownloadRuntime();
  emitAppEvent("video-queue-count", runtime.getQueueState());
  emitAppEvent("video-queue-detail", runtime.getQueueDetail());
}

async function restoreUiLabLiveState() {
  uiLabScenarioActive = false;
  clearUiLabRuntimeOverrides();
  emitAppEvent(UI_LAB_RESET_EVENT, { restoreLive: true });
  emitLiveVideoQueueState();
  const gateState = await getRuntimeDependencyGateState();
  emitAppEvent("runtime-dependency-gate-state", gateState);
}

async function applyUiLabScenario(scenario) {
  assertUiLabEnabled();
  await showMainWindow();

  if (scenario === "reset") {
    await restoreUiLabLiveState();
    return;
  }

  uiLabScenarioActive = true;
  emitAppEvent(UI_LAB_RESET_EVENT, { restoreLive: false });
  emitUiLabEmptyTaskState();
  clearUiLabRuntimeOverrides();

  if (scenario === "runtime-auto-config") {
    const runtimeStatus = createUiLabMissingRuntimeStatus();
    const gateState = {
      phase: "downloading",
      missingComponents: ["ffmpeg", "deno"],
      lastError: null,
      updatedAtMs: nowTimestampMs(),
      currentComponent: "ffmpeg",
      currentStage: "downloading",
      progressPercent: 42,
      downloadedBytes: 42 * 1024 * 1024,
      totalBytes: 100 * 1024 * 1024,
      nextComponent: "deno",
    };
    applyUiLabRuntimePreview(runtimeStatus, gateState);
    return;
  }

  if (scenario === "runtime-failed") {
    const runtimeStatus = createUiLabMissingRuntimeStatus();
    const gateState = {
      phase: "failed",
      missingComponents: ["ffmpeg", "deno"],
      lastError: "Failed to download FFmpeg runtime: request timed out after 30s",
      updatedAtMs: nowTimestampMs(),
      currentComponent: null,
      currentStage: null,
      progressPercent: null,
      downloadedBytes: null,
      totalBytes: null,
      nextComponent: "ffmpeg",
    };
    applyUiLabRuntimePreview(runtimeStatus, gateState);
    return;
  }

  applyUiLabReadyRuntimePreview();

  if (scenario === "download-active") {
    const traceId = "ui-lab-download-active";
    emitAppEvent("video-queue-count", {
      activeCount: 1,
      pendingCount: 0,
      totalCount: 1,
      maxConcurrent: getElectronDownloadRuntime().maxConcurrent ?? UI_LAB_VIDEO_QUEUE_MAX_CONCURRENT,
    });
    emitAppEvent("video-queue-detail", {
      tasks: [
        {
          traceId,
          label: "Pinterest seasonal campaign cut.mp4",
          status: "active",
        },
      ],
    });
    emitAppEvent("video-download-progress", {
      traceId,
      percent: 46,
      stage: "downloading",
      speed: "8.2 MB/s",
      eta: "00:12",
    });
    return;
  }

  if (scenario === "download-queued") {
    const activeTraceId = "ui-lab-download-queued-active";
    emitAppEvent("video-queue-count", {
      activeCount: 1,
      pendingCount: 2,
      totalCount: 3,
      maxConcurrent: getElectronDownloadRuntime().maxConcurrent ?? UI_LAB_VIDEO_QUEUE_MAX_CONCURRENT,
    });
    emitAppEvent("video-queue-detail", {
      tasks: [
        {
          traceId: activeTraceId,
          label: "Long-form interview master.mp4",
          status: "active",
        },
        {
          traceId: "ui-lab-download-queued-2",
          label: "Episode teaser vertical.mp4",
          status: "pending",
        },
        {
          traceId: "ui-lab-download-queued-3",
          label: "Creator archive backup.mp4",
          status: "pending",
        },
      ],
    });
    emitAppEvent("video-download-progress", {
      traceId: activeTraceId,
      percent: 12,
      stage: "preparing",
      speed: "Preparing...",
      eta: "",
    });
    return;
  }

  if (scenario === "transcode-active") {
    const traceId = "ui-lab-transcode-active";
    emitAppEvent("video-transcode-queue-count", {
      activeCount: 1,
      pendingCount: 1,
      failedCount: 0,
      totalCount: 2,
      maxConcurrent: 1,
    });
    emitAppEvent("video-transcode-queue-detail", {
      tasks: [
        {
          traceId,
          label: "Client delivery master.mov",
          status: "active",
          stage: "transcoding",
          progressPercent: 68,
          etaSeconds: 24,
          sourcePath: "D:/ui-lab/client-delivery-master.mov",
          sourceFormat: "mov",
          targetFormat: "mp4",
          error: null,
        },
        {
          traceId: "ui-lab-transcode-pending",
          label: "Reel export source.mov",
          status: "pending",
          stage: "analyzing",
          progressPercent: null,
          etaSeconds: null,
          sourcePath: "D:/ui-lab/reel-export-source.mov",
          sourceFormat: "mov",
          targetFormat: "mp4",
          error: null,
        },
      ],
    });
    emitAppEvent("video-transcode-progress", {
      traceId,
      label: "Client delivery master.mov",
      status: "active",
      stage: "transcoding",
      progressPercent: 68,
      etaSeconds: 24,
      sourcePath: "D:/ui-lab/client-delivery-master.mov",
      sourceFormat: "mov",
      targetFormat: "mp4",
      error: null,
    });
    return;
  }

  if (scenario === "transcode-failed") {
    const traceId = "ui-lab-transcode-failed";
    emitAppEvent("video-transcode-queue-count", {
      activeCount: 0,
      pendingCount: 0,
      failedCount: 1,
      totalCount: 1,
      maxConcurrent: 1,
    });
    emitAppEvent("video-transcode-queue-detail", {
      tasks: [
        {
          traceId,
          label: "Broadcast package master.mkv",
          status: "failed",
          stage: "failed",
          progressPercent: null,
          etaSeconds: null,
          sourcePath: "D:/ui-lab/broadcast-package-master.mkv",
          sourceFormat: "mkv",
          targetFormat: "mp4",
          error: "FFmpeg exited with code 1 while finalizing the MP4 output.",
        },
      ],
    });
    emitAppEvent("video-transcode-failed", {
      traceId,
      label: "Broadcast package master.mkv",
      status: "failed",
      stage: "failed",
      progressPercent: null,
      etaSeconds: null,
      sourcePath: "D:/ui-lab/broadcast-package-master.mkv",
      sourceFormat: "mkv",
      targetFormat: "mp4",
      error: "FFmpeg exited with code 1 while finalizing the MP4 output.",
    });
    return;
  }

  if (scenario === "mixed-busy") {
    const downloadTraceId = "ui-lab-mixed-download";
    const transcodeTraceId = "ui-lab-mixed-transcode";
    emitAppEvent("video-queue-count", {
      activeCount: 1,
      pendingCount: 1,
      totalCount: 2,
      maxConcurrent: getElectronDownloadRuntime().maxConcurrent ?? UI_LAB_VIDEO_QUEUE_MAX_CONCURRENT,
    });
    emitAppEvent("video-queue-detail", {
      tasks: [
        {
          traceId: downloadTraceId,
          label: "Compilation trailer capture.mp4",
          status: "active",
        },
        {
          traceId: "ui-lab-mixed-download-pending",
          label: "Livestream archive pull.mp4",
          status: "pending",
        },
      ],
    });
    emitAppEvent("video-download-progress", {
      traceId: downloadTraceId,
      percent: 74,
      stage: "merging",
      speed: "Merging...",
      eta: "",
    });
    emitAppEvent("video-transcode-queue-count", {
      activeCount: 1,
      pendingCount: 0,
      failedCount: 0,
      totalCount: 1,
      maxConcurrent: 1,
    });
    emitAppEvent("video-transcode-queue-detail", {
      tasks: [
        {
          traceId: transcodeTraceId,
          label: "Editorial proxy source.mov",
          status: "active",
          stage: "finalizing_mp4",
          progressPercent: 91,
          etaSeconds: 8,
          sourcePath: "D:/ui-lab/editorial-proxy-source.mov",
          sourceFormat: "mov",
          targetFormat: "mp4",
          error: null,
        },
      ],
    });
    emitAppEvent("video-transcode-progress", {
      traceId: transcodeTraceId,
      label: "Editorial proxy source.mov",
      status: "active",
      stage: "finalizing_mp4",
      progressPercent: 91,
      etaSeconds: 8,
      sourcePath: "D:/ui-lab/editorial-proxy-source.mov",
      sourceFormat: "mov",
      targetFormat: "mp4",
      error: null,
    });
    return;
  }

  throw new Error(`Unsupported UI Lab scenario: ${scenario}`);
}

function broadcastWsMessage(message) {
  const serialized = JSON.stringify(message);
  for (const client of wsClients) {
    if (client.readyState === client.OPEN) {
      client.send(serialized);
    }
  }
}

function takePendingProtectedImageRequest(requestId) {
  const pending = pendingProtectedImageRequests.get(requestId);
  if (!pending) {
    return null;
  }
  pendingProtectedImageRequests.delete(requestId);
  clearTimeout(pending.timeoutId);
  return pending;
}

function takePendingXiaohongshuDragRequest(requestId) {
  const pending = pendingXiaohongshuDragRequests.get(requestId);
  if (!pending) {
    return null;
  }
  pendingXiaohongshuDragRequests.delete(requestId);
  clearTimeout(pending.timeoutId);
  return pending;
}

async function requestProtectedImageResolution(payload) {
  if (wsClients.size === 0) {
    throw new Error("Browser extension is not connected");
  }

  const requestId = nextOpaqueId("protected-image");
  return new Promise((resolveResolution, rejectResolution) => {
    const timeoutId = setTimeout(() => {
      pendingProtectedImageRequests.delete(requestId);
      rejectResolution(new Error("Protected image resolution timed out"));
    }, PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS);

    pendingProtectedImageRequests.set(requestId, {
      resolveResolution,
      rejectResolution,
      timeoutId,
    });

    broadcastWsMessage({
      action: "resolve_protected_image",
      data: {
        requestId,
        token: payload.token,
        pageUrl: payload.pageUrl ?? null,
        imageUrl: payload.imageUrl ?? null,
        targetDir: payload.targetDir ?? null,
      },
    });
  });
}

async function requestXiaohongshuDragResolution(payload) {
  if (wsClients.size === 0) {
    throw new Error("Browser extension is not connected");
  }

  const requestId = nextOpaqueId("xiaohongshu-drag");
  console.log(
    ">>> [Xiaohongshu] Requesting extension-side drag resolution:",
    JSON.stringify({
      requestId,
      pageUrl: payload.pageUrl ?? null,
      detailUrl: payload.detailUrl ?? null,
      noteId: payload.noteId ?? null,
        imageUrl: payload.imageUrl ?? null,
        mediaType: payload.mediaType ?? null,
        videoIntentConfidence: payload.videoIntentConfidence ?? null,
        videoIntentSources: payload.videoIntentSources ?? [],
        hasToken: Boolean(payload.token),
        wsClientCount: wsClients.size,
      }),
  );
  return new Promise((resolveResolution, rejectResolution) => {
    const timeoutId = setTimeout(() => {
      pendingXiaohongshuDragRequests.delete(requestId);
      rejectResolution(new Error("Xiaohongshu drag resolution timed out"));
    }, XIAOHONGSHU_DRAG_RESOLUTION_TIMEOUT_MS);

    pendingXiaohongshuDragRequests.set(requestId, {
      resolveResolution,
      rejectResolution,
      timeoutId,
    });

    broadcastWsMessage({
      action: "resolve_xiaohongshu_drag",
      data: {
        requestId,
        token: payload.token,
        pageUrl: payload.pageUrl ?? null,
        detailUrl: payload.detailUrl ?? null,
        noteId: payload.noteId ?? null,
        imageUrl: payload.imageUrl ?? null,
        mediaType: payload.mediaType ?? null,
        videoIntentConfidence: payload.videoIntentConfidence ?? null,
        videoIntentSources: payload.videoIntentSources ?? [],
      },
    });
  });
}

function summarizeXiaohongshuResolutionForLogs(payload) {
  return {
    kind: payload?.kind ?? "unknown",
    pageUrl: payload?.pageUrl ?? null,
    imageUrl: payload?.imageUrl ?? null,
    videoUrl: payload?.videoUrl ?? null,
    videoIntentConfidence: typeof payload?.videoIntentConfidence === "number"
      ? payload.videoIntentConfidence
      : null,
    videoIntentSources: Array.isArray(payload?.videoIntentSources)
      ? payload.videoIntentSources
      : [],
    videoCandidatesCount: Array.isArray(payload?.videoCandidates) ? payload.videoCandidates.length : 0,
    videoCandidatesPreview: Array.isArray(payload?.videoCandidates)
      ? payload.videoCandidates.slice(0, 3).map((candidate) => ({
          type: candidate?.type ?? null,
          source: candidate?.source ?? null,
          url: typeof candidate?.url === "string" ? candidate.url.slice(0, 140) : null,
        }))
      : [],
  };
}

async function broadcastTheme(theme) {
  broadcastWsMessage({
    action: "theme_changed",
    data: {
      theme,
    },
  });
}

async function updateTrayMenu(startupConfigSnapshot = null) {
  const language = startupConfigSnapshot?.language ?? await readCurrentLanguage();
  const labels = await loadTrayLabels(language);
  const menu = Menu.buildFromTemplate([
    {
      id: "show",
      label: labels.show,
      click: () => {
        showMainWindow();
      },
    },
    {
      id: "settings",
      label: labels.settings,
      click: () => {
        void openSecondaryWindow(WINDOW_LABELS.settings, {
          title: labels.settings,
          width: SETTINGS_WINDOW_WIDTH,
          height: SETTINGS_WINDOW_HEIGHT,
          alwaysOnTop: true,
          focus: true,
        });
      },
    },
    {
      id: "quit",
      label: labels.quit,
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  if (!tray) {
    tray = new Tray(createTrayImage());
    tray.on("click", () => {
      showMainWindow();
    });
  }

  tray.setToolTip("Ameow");
  tray.setContextMenu(menu);
}

function getBaseRendererUrl() {
  const envUrl = process.env.AMEOW_FRONTEND_URL ?? process.env.AMEOW_ELECTRON_DEV_SERVER_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }
  return "http://127.0.0.1:1420";
}

function buildRendererRoute(routePath) {
  const normalizedRoute = routePath.startsWith("/") ? routePath : `/${routePath}`;
  if (!app.isPackaged) {
    return `${getBaseRendererUrl()}#${normalizedRoute}`;
  }

  return `${pathToFileURL(join(repoRoot, "dist", "index.html")).toString()}#${normalizedRoute}`;
}

function secondaryWindowRoute(label) {
  if (label === WINDOW_LABELS.settings) {
    return "/settings";
  }
  if (label === WINDOW_LABELS.contextMenu) {
    return "/context-menu";
  }
  if (label === WINDOW_LABELS.uiLab) {
    return "/ui-lab";
  }
  throw new Error(`Unsupported secondary window label: ${label}`);
}

function getWindow(label) {
  return windows.get(label) ?? null;
}

function registerWindow(label, win) {
  windows.set(label, win);
  win.on("focus", () => {
    win.webContents.send("ameow:current-window:focus-changed", true);
  });
  win.on("blur", () => {
    win.webContents.send("ameow:current-window:focus-changed", false);
    win.webContents.send("ameow:current-window:blur");
  });
  win.on("closed", () => {
    windows.delete(label);
    if (label === WINDOW_LABELS.contextMenu) {
      emitAppEvent(CONTEXT_MENU_CLOSED_EVENT, undefined);
    }
    if (label === WINDOW_LABELS.uiLab && uiLabScenarioActive) {
      void restoreUiLabLiveState().catch((error) => {
        console.error("Failed to restore live state after UI Lab close:", error);
      });
    }
  });
}

async function createMainWindow(startupConfigSnapshot = null) {
  const existing = getWindow(WINDOW_LABELS.main);
  if (existing && !existing.isDestroyed()) {
    return existing;
  }

  const startupWindowMode = resolveMainWindowStartupMode({
    platform: process.platform,
    hasShownMainWindowOnce,
  });
  const initialWindowSize = getMainWindowOuterSize(process.platform, startupWindowMode);

  const {
    browserWindow: mainWindow,
    transparentWindow,
  } = await createAmeowBrowserWindow(WINDOW_LABELS.main, {
    routePath: "/",
    width: initialWindowSize,
    height: initialWindowSize,
    startupWindowMode,
    title: app.getName(),
    alwaysOnTop: true,
    skipTaskbar: process.platform === "win32",
    allowTransparency: true,
    frame: false,
    resizable: false,
    preferZeroAlphaTransparentBackground: true,
  }, startupConfigSnapshot);
  mainWindowUsesTransparentShell = transparentWindow;
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  if (process.platform === "win32" && app.isPackaged && transparentWindow) {
    mainWindow.on("focus", () => {
      applyMainWindowVisibleZOrder(mainWindow, "focus");
    });
  }

  const revealReadyPromise = waitForWindowReadyToReveal(
    mainWindow,
    WINDOW_LABELS.main,
    transparentWindow,
    {
      // Development should reveal the window on the first stable paint instead of
      // holding first show behind the full renderer-ready handshake.
      awaitRendererReady: app.isPackaged,
    },
  );

  await mainWindow.loadURL(buildRendererRoute("/"));
  await revealReadyPromise;
  void queueStartupDiagnostic("WindowDiag", "main:create-complete", getWindowSnapshot(mainWindow));
  return mainWindow;
}

async function showMainWindow({
  preserveExistingBounds = false,
  startupConfigSnapshot = null,
  preferredPosition = null,
}: {
  preserveExistingBounds?: boolean;
  startupConfigSnapshot?: unknown;
  preferredPosition?: { x: number; y: number } | null;
} = {}) {
  const mainWindow = await createMainWindow(startupConfigSnapshot);
  const currentBounds = mainWindow.getBounds();
  const baseBounds = preferredPosition
    ? {
      ...currentBounds,
      x: Math.round(preferredPosition.x),
      y: Math.round(preferredPosition.y),
    }
    : currentBounds;
  const revealBounds = resolveMainWindowRevealBounds({
    bounds: baseBounds,
    displays: screen.getAllDisplays().map((display) => display.workArea),
    fallbackDisplay: screen.getPrimaryDisplay().workArea,
    forceCenter: process.platform === "win32" && app.isPackaged && !hasShownMainWindowOnce,
    minimumWidth: preserveExistingBounds
      ? currentBounds.width
      : getMainWindowFullOuterSize(process.platform),
    minimumHeight: preserveExistingBounds
      ? currentBounds.height
      : getMainWindowFullOuterSize(process.platform),
  });

  void queueStartupDiagnostic("WindowDiag", "main:show-request", {
    revealBounds,
    preShow: getWindowSnapshot(mainWindow),
    transparentShell: mainWindowUsesTransparentShell,
  });

  mainWindow.setBounds(revealBounds);
  void queueStartupDiagnostic("WindowDiag", "main:show-step", {
    step: "before-show",
    snapshot: getWindowSnapshot(mainWindow),
  });
  mainWindow.show();
  void queueStartupDiagnostic("WindowDiag", "main:show-step", {
    step: "after-show",
    snapshot: getWindowSnapshot(mainWindow),
  });
  if (mainWindow.isMinimized()) {
    void queueStartupDiagnostic("WindowDiag", "main:show-step", {
      step: "before-restore",
      snapshot: getWindowSnapshot(mainWindow),
    });
    mainWindow.restore();
    void queueStartupDiagnostic("WindowDiag", "main:show-step", {
      step: "after-restore",
      snapshot: getWindowSnapshot(mainWindow),
    });
  }
  void queueStartupDiagnostic("WindowDiag", "main:show-step", {
    step: "before-focus",
    snapshot: getWindowSnapshot(mainWindow),
  });
  mainWindow.focus();
  applyMainWindowVisibleZOrder(mainWindow, "show");
  void queueStartupDiagnostic("WindowDiag", "main:show-step", {
    step: "after-z-order",
    snapshot: getWindowSnapshot(mainWindow),
  });
  hasShownMainWindowOnce = true;
  void queueStartupDiagnostic("WindowDiag", "main:show-complete", getWindowSnapshot(mainWindow));
  void collectWindowStartupArtifacts(mainWindow, WINDOW_LABELS.main, "show");
}

function resolveShortcutMainWindowPlacement() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const bounds = resolveWindowBoundsNearCursor({
    cursor,
    display: display.workArea,
    width: getMainWindowFullOuterSize(process.platform),
    height: getMainWindowFullOuterSize(process.platform),
    edgePadding: WINDOW_EDGE_PADDING,
  });

  return {
    cursor,
    position: {
      x: bounds.x,
      y: bounds.y,
    },
  };
}

async function handleRegisteredShortcut() {
  const nowMs = Date.now();
  if (nowMs - lastShortcutTriggerMs < SHORTCUT_TOGGLE_COOLDOWN_MS) {
    return;
  }
  lastShortcutTriggerMs = nowMs;

  const mainWindow = await createMainWindow();
  const { cursor, position } = resolveShortcutMainWindowPlacement();
  const shouldHide = mainWindow.isVisible()
    && mainWindow.isFocused()
    && isPointInsideBounds(cursor, mainWindow.getBounds());

  if (shouldHide) {
    mainWindow.hide();
    return;
  }

  await showMainWindow({
    preferredPosition: position,
  });
  emitAppEvent(SHORTCUT_SHOW_EVENT, undefined);
}

function showSecondaryWindow(label, win, options) {
  if (win.isDestroyed()) {
    return;
  }

  if (options.focus === false && typeof win.showInactive === "function") {
    win.showInactive();
  } else {
    win.show();
  }
  if (options.focus !== false) {
    win.focus();
  }
  void collectWindowStartupArtifacts(win, label, "show");
}

async function openSecondaryWindow(label, options) {
  const resolvedOptions = resolveSecondaryWindowOpenOptions(label, options);
  const existing = getWindow(label);
  if (existing && !existing.isDestroyed()) {
    showSecondaryWindow(label, existing, resolvedOptions);
    return existing;
  }

  const routePath = secondaryWindowRoute(label);
  const secondaryWindowOuterSize = (
    label === WINDOW_LABELS.settings || label === WINDOW_LABELS.uiLab
  )
    ? getSecondaryWindowOuterSize(process.platform, resolvedOptions.width, resolvedOptions.height)
    : null;
  const {
    browserWindow,
    transparentWindow,
  } = await createAmeowBrowserWindow(label, {
    routePath,
    width: secondaryWindowOuterSize?.width ?? resolvedOptions.width,
    height: secondaryWindowOuterSize?.height ?? resolvedOptions.height,
    x: resolvedOptions.x,
    y: resolvedOptions.y,
    center: resolvedOptions.center === true,
    title: resolvedOptions.title,
    allowTransparency: resolvedOptions.transparent !== false,
    frame: resolvedOptions.decorations === true,
    resizable: resolvedOptions.resizable === true,
    alwaysOnTop: resolvedOptions.alwaysOnTop !== false,
    skipTaskbar: resolvedOptions.skipTaskbar ?? process.platform === "win32",
    parentLabel: resolvedOptions.parent === "main" ? WINDOW_LABELS.main : undefined,
    preferZeroAlphaTransparentBackground: (
      label === WINDOW_LABELS.settings || label === WINDOW_LABELS.uiLab
    ) && resolvedOptions.transparent !== false,
  });

  const initialRevealReady = waitForInitialWindowReveal(browserWindow);
  const loadUrlPromise = browserWindow.loadURL(
    buildRendererRoute(routePath),
  );
  let loadUrlError: unknown = null;
  void loadUrlPromise.catch((error) => {
    loadUrlError = error;
  });

  // Secondary utility windows should reveal on the first stable paint signal
  // instead of waiting for the full renderer-ready handshake.
  await initialRevealReady;
  await delayTransparentPackagedWindowReveal(label, transparentWindow);
  if (!browserWindow.isVisible()) {
    if (loadUrlError === null) {
      showSecondaryWindow(label, browserWindow, resolvedOptions);
    }
  }
  await loadUrlPromise;
  return browserWindow;
}

function resolveSecondaryWindowAnchorLabel(label) {
  if (label === WINDOW_LABELS.settings) {
    return WINDOW_LABELS.main;
  }
  if (label === WINDOW_LABELS.uiLab) {
    const settingsWindow = getWindow(WINDOW_LABELS.settings);
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      return WINDOW_LABELS.settings;
    }
    return WINDOW_LABELS.main;
  }
  return null;
}

function resolveSecondaryWindowGap(label) {
  if (label === WINDOW_LABELS.uiLab) {
    return UI_LAB_WINDOW_GAP;
  }
  return SETTINGS_WINDOW_GAP;
}

function resolveSecondaryWindowOpenOptions(label, options) {
  if (
    typeof options?.x === "number"
    || typeof options?.y === "number"
    || options?.center === true
  ) {
    return options;
  }

  const anchorLabel = resolveSecondaryWindowAnchorLabel(label);
  if (!anchorLabel) {
    return options;
  }

  const anchorWindow = getWindow(anchorLabel);
  if (!anchorWindow || anchorWindow.isDestroyed()) {
    return options;
  }

  const anchorBounds = anchorWindow.getBounds();
  const workArea = screen.getDisplayMatching(anchorBounds).workArea;
  const gap = resolveSecondaryWindowGap(label);
  const minX = workArea.x + WINDOW_EDGE_PADDING;
  const minY = workArea.y + WINDOW_EDGE_PADDING;
  const maxX = workArea.x + workArea.width - options.width - WINDOW_EDGE_PADDING;
  const maxY = workArea.y + workArea.height - options.height - WINDOW_EDGE_PADDING;

  let x = anchorBounds.x + anchorBounds.width + gap;
  let y = anchorBounds.y;

  if (x > maxX) {
    x = anchorBounds.x - options.width - gap;
  }

  return {
    ...options,
    center: false,
    x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
  };
}

async function getAutostart() {
  if (process.platform === "win32") {
    return isWindowsAutostartEnabled(
      app.getLoginItemSettings(getWindowsAutostartQuery(process.execPath)),
      process.execPath,
    );
  }

  if (process.platform !== "darwin") {
    return false;
  }

  return app.getLoginItemSettings().openAtLogin;
}

async function setAutostart(enabled) {
  if (process.platform === "win32") {
    app.setLoginItemSettings(
      buildWindowsAutostartSettings(process.execPath, enabled),
    );
    return;
  }

  if (process.platform !== "darwin") {
    return;
  }

  app.setLoginItemSettings({ openAtLogin: enabled });
}

async function registerShortcut(shortcut) {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = "";
  }
  if (!shortcut) {
    return;
  }
  const success = globalShortcut.register(shortcut, () => {
    void handleRegisteredShortcut().catch((error) => {
      console.error(">>> [Electron] Failed to handle registered shortcut:", error);
    });
  });
  if (!success) {
    throw new Error(`Failed to register shortcut: ${shortcut}`);
  }
  registeredShortcut = shortcut;
}

async function registerShortcutFromConfig(startupConfigSnapshot = null) {
  const shortcut = startupConfigSnapshot?.shortcut;
  if (typeof shortcut === "string") {
    if (shortcut) {
      await registerShortcut(shortcut);
    }
    return;
  }

  const config = await readConfigObject();
  if (typeof config.shortcut === "string" && config.shortcut.trim()) {
    await registerShortcut(config.shortcut.trim());
  }
}

async function runDeferredDevStartupTasks() {
  try {
    await ensureUserDataDirs();
    await Promise.all([
      updateTrayMenu(),
      registerShortcutFromConfig(),
    ]);
  } catch (error) {
    console.error(">>> [Electron] Deferred dev startup task failed:", error);
  }
}

async function openDialogForEvent(event, options) {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const properties = [];
  if (options.directory) {
    properties.push("openDirectory");
  } else {
    properties.push("openFile");
  }
  if (options.multiple) {
    properties.push("multiSelections");
  }

  const result = await dialog.showOpenDialog(browserWindow ?? undefined, {
    title: options.title,
    properties,
    filters: options.filters,
  });

  if (result.canceled) {
    return null;
  }
  if (options.multiple) {
    return result.filePaths;
  }
  return result.filePaths[0] ?? null;
}

async function openCurrentOutputFolder() {
  const folderPath = await resolveCurrentOutputFolderPath();
  await openPathOrThrow(folderPath, {
    ensureDirectory: true,
    shellLike: shell,
  });
}

async function beginPickOutputFolderFromContextMenu() {
  const contextMenu = getWindow(WINDOW_LABELS.contextMenu);
  if (contextMenu && !contextMenu.isDestroyed()) {
    contextMenu.close();
  }
  emitAppEvent(CONTEXT_MENU_CLOSED_EVENT, undefined);

  const mainWindow = await createMainWindow();
  const wasAlwaysOnTop = mainWindow.isAlwaysOnTop();
  if (wasAlwaysOnTop) {
    mainWindow.setAlwaysOnTop(false);
  }
  mainWindow.focus();

  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) {
      return;
    }
    const nextOutputPath = result.filePaths[0];
    const config = await readConfigObject();
    if (config.outputPath === nextOutputPath) {
      return;
    }
    config.outputPath = nextOutputPath;
    await saveConfigString(JSON.stringify(config));
    emitAppEvent("output-path-changed", { path: nextOutputPath });
  } finally {
    if (wasAlwaysOnTop) {
      applyMainWindowVisibleZOrder(mainWindow, "dialog-restore");
    }
    mainWindow.focus();
  }
}

async function beginOpenOutputFolderFromContextMenu() {
  const contextMenu = getWindow(WINDOW_LABELS.contextMenu);
  if (contextMenu && !contextMenu.isDestroyed()) {
    contextMenu.close();
  }
  emitAppEvent(CONTEXT_MENU_CLOSED_EVENT, undefined);
  await openCurrentOutputFolder();
}

async function readClipboardImage() {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }
  const size = image.getSize();
  return {
    width: size.width,
    height: size.height,
    rgba: Array.from(image.toBitmap()),
  };
}

async function checkForAppUpdate() {
  return appUpdateController.checkForAppUpdate();
}

async function downloadAndInstallAppUpdate() {
  return appUpdateController.downloadAndInstallAppUpdate();
}

function buildRequestData(requestId, code, extraData = {}) {
  if (!requestId) {
    return Object.keys(extraData).length > 0 ? extraData : null;
  }
  return {
    requestId,
    ...(code ? { code } : {}),
    ...extraData,
  };
}

function extractRequestId(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (typeof data.requestId === "string") {
    return data.requestId;
  }
  if (typeof data.request_id === "string") {
    return data.request_id;
  }
  return null;
}

async function handleWsMessage(rawMessage) {
  let parsed;
  try {
    parsed = JSON.parse(rawMessage.toString());
  } catch (error) {
    return {
      success: false,
      message: `Invalid JSON: ${error}`,
      data: null,
    };
  }

  const action = parsed.action;
  const data = parsed.data ?? null;
  const requestId = extractRequestId(data);
  const withRequest = (code, extraData) => buildRequestData(requestId, code, extraData);

  switch (action) {
    case "ping":
      return {
        success: true,
        message: "pong",
        data: null,
      };
    case "get_theme":
      return {
        success: true,
        message: null,
        data: {
          action: "theme_info",
          theme: await readCurrentTheme(),
        },
      };
    case "get_language":
      return {
        success: true,
        message: null,
        data: {
          action: "language_info",
          language: await readCurrentLanguage(),
        },
      };
    case "get_extension_debug_config":
      return {
        success: true,
        message: null,
        data: {
          action: "extension_debug_config_info",
          enabled: resolveExtensionInjectionDebugEnabledFromConfigObject(await readConfigObject()),
        },
      };
    case "sync_download_preferences": {
      if (!data || typeof data !== "object") {
        return {
          success: false,
          message: "Missing data",
          data: withRequest("missing_data"),
        };
      }
      const syncedPreferences = await syncIncomingDownloadPreferences(data);
      if (!syncedPreferences) {
        return {
          success: false,
          message: "Missing download preference fields",
          data: withRequest("missing_download_preference_fields"),
        };
      }
      return {
        success: true,
        message: "Download preferences synced",
        data: withRequest(null, {
          quality: syncedPreferences.quality,
          aeFriendlyConversionEnabled: syncedPreferences.aeFriendlyConversionEnabled,
        }),
      };
    }
    case "save_image": {
      if (!data?.url) {
        return {
          success: false,
          message: "Missing url",
          data: withRequest("missing_url"),
        };
      }
      try {
        const filePath = await saveDownloadedImage(
          data.url,
          typeof data.targetDir === "string" ? data.targetDir : null,
          typeof data.originalFilename === "string" ? data.originalFilename : null,
          null,
          {
            requestHeaders: data.requestHeaders ?? data.request_headers,
            referrer: data.referrer ?? data.pageUrl ?? data.page_url,
          },
          imageDownloadDependencies,
        );
        return {
          success: true,
          message: filePath,
          data: withRequest(null),
        };
      } catch (error) {
        return {
          success: false,
          message: String(error),
          data: withRequest("save_image_failed"),
        };
      }
    }
    case "save_data_url": {
      if (!data?.dataUrl && !data?.data_url) {
        return {
          success: false,
          message: "Missing dataUrl",
          data: withRequest("missing_data_url"),
        };
      }
      try {
        const filePath = await saveImageDataUrl(
          data.dataUrl ?? data.data_url,
          typeof data.targetDir === "string"
            ? data.targetDir
            : typeof data.target_dir === "string"
              ? data.target_dir
              : null,
          typeof data.originalFilename === "string"
            ? data.originalFilename
            : typeof data.original_filename === "string"
              ? data.original_filename
              : null,
          {
            requireRenameEnabled:
              data.requireRenameEnabled === true
              || data.require_rename_enabled === true,
          },
          imageDownloadDependencies,
        );
        return {
          success: true,
          message: filePath,
          data: withRequest(null),
        };
      } catch (error) {
        const errorMessage = String(error);
        return {
          success: false,
          message: errorMessage,
          data: withRequest(
            errorMessage.includes("rename_disabled")
              ? "rename_disabled"
              : "save_data_url_failed",
          ),
        };
      }
    }
    case "protected_image_resolution_result": {
      const correlationRequestId = normalizeOptionalString(
        data?.correlationRequestId ?? data?.correlation_request_id,
      );
      if (!correlationRequestId) {
        return {
          success: false,
          message: "Missing correlationRequestId",
          data: withRequest("missing_correlation_request_id"),
        };
      }

      const pending = takePendingProtectedImageRequest(correlationRequestId);
      if (!pending) {
        return {
          success: false,
          message: "Unknown protected image correlation request",
          data: withRequest("unknown_correlation_request"),
        };
      }

      pending.resolveResolution({
        success: data?.success === true,
        filePath: normalizeOptionalString(data?.filePath ?? data?.file_path),
        code: normalizeOptionalString(data?.code),
        error: normalizeOptionalString(data?.error),
      });
      return {
        success: true,
        message: "protected_image_resolution_received",
        data: withRequest(null),
      };
    }
    case "pasted_video_selection_result": {
      const result = getExtensionRequestBridge().handlePastedVideoSelectionResult(data);
      return {
        success: result.success,
        message: result.message,
        data: withRequest(result.success ? null : result.code),
      };
    }
    case "xiaohongshu_drag_resolution_result": {
      const correlationRequestId = normalizeOptionalString(
        data?.correlationRequestId ?? data?.correlation_request_id,
      );
      if (!correlationRequestId) {
        return {
          success: false,
          message: "Missing correlationRequestId",
          data: withRequest("missing_correlation_request_id"),
        };
      }

      const pending = takePendingXiaohongshuDragRequest(correlationRequestId);
      if (!pending) {
        return {
          success: false,
          message: "Unknown Xiaohongshu drag correlation request",
          data: withRequest("unknown_correlation_request"),
        };
      }

      pending.resolveResolution({
        success: data?.success === true,
        kind: normalizeOptionalString(data?.kind) ?? "unknown",
        pageUrl: normalizeOptionalString(data?.pageUrl ?? data?.page_url),
        detailUrl: normalizeOptionalString(data?.detailUrl ?? data?.detail_url),
        sourcePageUrl: normalizeOptionalString(data?.sourcePageUrl ?? data?.source_page_url),
        imageUrl: normalizeOptionalString(data?.imageUrl ?? data?.image_url),
        videoUrl: normalizeOptionalString(data?.videoUrl ?? data?.video_url),
        videoCandidates: Array.isArray(data?.videoCandidates ?? data?.video_candidates)
          ? normalizeVideoCandidates(data?.videoCandidates ?? data?.video_candidates, "xiaohongshu")
          : [],
        cookies: normalizeOptionalString(data?.cookies),
        videoIntentConfidence:
          typeof data?.videoIntentConfidence === "number"
            ? data.videoIntentConfidence
            : typeof data?.video_intent_confidence === "number"
              ? data.video_intent_confidence
              : null,
        videoIntentSources: Array.isArray(data?.videoIntentSources ?? data?.video_intent_sources)
          ? (data?.videoIntentSources ?? data?.video_intent_sources)
          : [],
        code: normalizeOptionalString(data?.code),
        error: normalizeOptionalString(data?.error),
      });
      console.log(
        ">>> [Xiaohongshu] Received extension-side drag resolution:",
        JSON.stringify({
          correlationRequestId,
          success: data?.success === true,
          kind: normalizeOptionalString(data?.kind) ?? "unknown",
          pageUrl: normalizeOptionalString(data?.pageUrl ?? data?.page_url),
          detailUrl: normalizeOptionalString(data?.detailUrl ?? data?.detail_url),
          sourcePageUrl: normalizeOptionalString(data?.sourcePageUrl ?? data?.source_page_url),
          imageUrl: normalizeOptionalString(data?.imageUrl ?? data?.image_url),
          videoUrl: normalizeOptionalString(data?.videoUrl ?? data?.video_url),
          videoCandidatesCount: Array.isArray(data?.videoCandidates ?? data?.video_candidates)
            ? (data?.videoCandidates ?? data?.video_candidates).length
            : 0,
          cookiesPresent: Boolean(normalizeOptionalString(data?.cookies)),
          code: normalizeOptionalString(data?.code),
          error: normalizeOptionalString(data?.error),
        }),
      );
      return {
        success: true,
        message: "xiaohongshu_drag_resolution_received",
        data: withRequest(null),
      };
    }
    case "video_selected_v2": {
      if (!data || typeof data !== "object") {
        return {
          success: false,
          message: "Missing data",
          data: withRequest("missing_data"),
        };
      }

      const url = normalizeOptionalString(data.url);
      if (!url) {
        return {
          success: false,
          message: "Missing url in data",
          data: withRequest("missing_url"),
        };
      }

      try {
        const config = await readConfigObject();
        logInjectedVideoSelectionDebug(
          config,
          "Received websocket video_selected_v2 payload",
          summarizeInjectedVideoSelectionPayload(data),
        );
        const syncedPreferences = await syncIncomingDownloadPreferences(data);
        const ack = await getVideoDownloadCommandBridge().invoke("queue_video_download", {
          url,
          pageUrl: data.pageUrl,
          videoUrl: data.videoUrl,
          videoCandidates: data.videoCandidates,
          siteHint: data.siteHint,
          title: data.title,
          cookies: data.cookies,
          selectionScope: data.selectionScope,
          ytdlpQualityPreference:
            syncedPreferences?.quality
            ?? data.ytdlpQualityPreference
            ?? data.defaultVideoDownloadQuality,
        });
        return {
          success: true,
          message: "Download queued",
          data: withRequest(null, {
            traceId: ack.traceId,
          }),
        };
      } catch (error) {
        return {
          success: false,
          message: String(error),
          data: withRequest("queue_video_download_failed"),
        };
      }
    }
    default:
      return {
        success: false,
        message: `Unknown action: ${action}`,
        data: withRequest("unknown_action"),
      };
  }
}

async function handleCommand(command, payload = {}) {
  const videoDownloadCommands = getVideoDownloadCommandBridge();
  if (videoDownloadCommands.supports(command)) {
    return videoDownloadCommands.invoke(command, payload);
  }

  switch (command) {
    case "get_config":
      return readConfigString();
    case "save_config":
      await saveConfigString(String(payload.json ?? "{}"));
      return;
    case "broadcast_theme":
      await broadcastTheme(String(payload.theme ?? FALLBACK_THEME));
      return;
    case "open_current_output_folder":
      await openCurrentOutputFolder();
      return;
    case "begin_open_output_folder_from_context_menu":
      await beginOpenOutputFolderFromContextMenu();
      return;
    case "begin_pick_output_folder_from_context_menu":
      await beginPickOutputFolderFromContextMenu();
      return;
    case "get_autostart":
      return getAutostart();
    case "set_autostart":
      await setAutostart(Boolean(payload.enabled));
      return;
    case "get_current_shortcut": {
      const config = await readConfigObject();
      return typeof config.shortcut === "string" ? config.shortcut : "";
    }
    case "register_shortcut":
      await registerShortcut(String(payload.shortcut ?? ""));
      return;
    case "set_window_size": {
      const win = getWindow(WINDOW_LABELS.main);
      if (!win) {
        throw new Error("Window not found");
      }
      win.setSize(Number(payload.width ?? 200), Number(payload.height ?? 200));
      return;
    }
    case "set_window_position": {
      const win = getWindow(WINDOW_LABELS.main);
      if (!win) {
        throw new Error("Window not found");
      }
      win.setPosition(Number(payload.x ?? 0), Number(payload.y ?? 0));
      return;
    }
    case "open_folder":
      await openPathOrThrow(String(payload.path ?? ""), {
        shellLike: shell,
      });
      return;
    case "reset_rename_counter":
      resetRenameSequenceState();
      return true;
    case "process_files":
      return processFiles(Array.isArray(payload.paths) ? payload.paths : [], payload.targetDir ?? null);
    case "download_image":
      return saveDownloadedImage(
        String(payload.url ?? ""),
        payload.targetDir ?? null,
        payload.originalFilename ?? null,
        payload.protectedImageFallback ?? null,
        {
          requestHeaders: payload.requestHeaders ?? payload.request_headers,
          referrer: payload.referrer ?? payload.pageUrl ?? payload.page_url,
        },
        imageDownloadDependencies,
      );
    case "dev_ui_lab_apply_scenario":
      await applyUiLabScenario(String(payload.scenario ?? ""));
      return;
    case "save_data_url":
      return saveImageDataUrl(
        String(payload.dataUrl ?? ""),
        payload.targetDir ?? null,
        payload.originalFilename ?? null,
        {
          requireRenameEnabled: payload.requireRenameEnabled === true,
        },
        imageDownloadDependencies,
      );
    case "get_clipboard_files":
      return getClipboardFilePaths();
    case "export_support_log":
      return exportSupportLog();
    case "resolve_xiaohongshu_drag_media": {
      const pageUrl = typeof payload.pageUrl === "string"
        ? payload.pageUrl
        : typeof payload.page_url === "string"
          ? payload.page_url
          : undefined;
      const noteId = typeof payload.noteId === "string"
        ? payload.noteId
        : typeof payload.note_id === "string"
          ? payload.note_id
          : undefined;
      const imageUrl = typeof payload.imageUrl === "string"
        ? payload.imageUrl
        : typeof payload.image_url === "string"
          ? payload.image_url
          : undefined;
      const detailUrl = typeof payload.detailUrl === "string"
        ? payload.detailUrl
        : typeof payload.detail_url === "string"
          ? payload.detail_url
          : undefined;
      const sourcePageUrl = typeof payload.sourcePageUrl === "string"
        ? payload.sourcePageUrl
        : typeof payload.source_page_url === "string"
          ? payload.source_page_url
          : undefined;
      const token = typeof payload.token === "string" ? payload.token : undefined;
      const mediaType = typeof payload.mediaType === "string"
        ? payload.mediaType
        : typeof payload.media_type === "string"
          ? payload.media_type
          : undefined;
      const videoIntentConfidence = typeof payload.videoIntentConfidence === "number"
        ? payload.videoIntentConfidence
        : typeof payload.video_intent_confidence === "number"
          ? payload.video_intent_confidence
          : undefined;
      const videoIntentSources = Array.isArray(payload.videoIntentSources)
        ? payload.videoIntentSources
        : Array.isArray(payload.video_intent_sources)
          ? payload.video_intent_sources
          : undefined;
      let resolvedViaExtension = null;
      let extensionCookies = typeof payload.cookies === "string" ? payload.cookies : undefined;

      if (token) {
        try {
          resolvedViaExtension = await requestXiaohongshuDragResolution({
            token,
            pageUrl,
            detailUrl,
            noteId,
            imageUrl,
            mediaType,
            videoIntentConfidence,
            videoIntentSources,
          });
          extensionCookies = normalizeOptionalString(resolvedViaExtension?.cookies) ?? extensionCookies;
          console.log(
            ">>> [Xiaohongshu] Electron command resolved extension result:",
            JSON.stringify({
              pageUrl: pageUrl ?? String(payload.url ?? ""),
              detailUrl: resolvedViaExtension?.detailUrl ?? detailUrl ?? null,
              success: resolvedViaExtension?.success === true,
              kind: resolvedViaExtension?.kind ?? "unknown",
              imageUrl: resolvedViaExtension?.imageUrl ?? null,
              videoUrl: resolvedViaExtension?.videoUrl ?? null,
              videoCandidatesCount: resolvedViaExtension?.videoCandidates?.length ?? 0,
              detailUrl: resolvedViaExtension?.detailUrl ?? detailUrl ?? null,
              sourcePageUrl: resolvedViaExtension?.sourcePageUrl ?? sourcePageUrl ?? null,
              cookiesPresent: Boolean(extensionCookies),
            }),
          );
          if (resolvedViaExtension?.success && hasUsableXiaohongshuVideoMedia(resolvedViaExtension)) {
            return {
              kind: resolvedViaExtension.kind === "video" || resolvedViaExtension.kind === "image"
                ? resolvedViaExtension.kind
                : "unknown",
              pageUrl: resolvedViaExtension.pageUrl ?? pageUrl ?? String(payload.url ?? ""),
              imageUrl: resolvedViaExtension.imageUrl ?? imageUrl ?? null,
              videoUrl: resolvedViaExtension.videoUrl ?? null,
              videoCandidates: resolvedViaExtension.videoCandidates ?? [],
              videoIntentConfidence:
                typeof resolvedViaExtension.videoIntentConfidence === "number"
                  ? resolvedViaExtension.videoIntentConfidence
                  : videoIntentConfidence ?? null,
              videoIntentSources: Array.isArray(resolvedViaExtension.videoIntentSources)
                ? resolvedViaExtension.videoIntentSources
                : videoIntentSources ?? [],
            };
          }
        } catch (error) {
          console.warn(
            ">>> [Xiaohongshu] Extension drag resolution failed, falling back to desktop fetch:",
            error,
          );
        }
      }

      console.log(
        ">>> [Xiaohongshu] Falling back to desktop-side page resolution:",
        JSON.stringify({
              pageUrl: pageUrl ?? String(payload.url ?? ""),
              detailUrl: detailUrl ?? null,
              noteId: noteId ?? null,
          imageUrl: imageUrl ?? null,
          mediaType: mediaType ?? null,
          videoIntentConfidence: videoIntentConfidence ?? null,
          videoIntentSources: videoIntentSources ?? [],
          detailUrl: detailUrl ?? resolvedViaExtension?.detailUrl ?? null,
          sourcePageUrl: sourcePageUrl ?? resolvedViaExtension?.sourcePageUrl ?? null,
          hasToken: Boolean(token),
          cookiesPresent: Boolean(extensionCookies),
        }),
      );
      const resolvedViaDesktopFallback = await resolveXiaohongshuDragMedia(
        {
          url: String(payload.url ?? ""),
          pageUrl,
          noteId,
          imageUrl,
          mediaType: mediaType === "video" || mediaType === "image" ? mediaType : null,
          videoIntentConfidence,
          videoIntentSources,
          cookies: extensionCookies,
          siteHint: "xiaohongshu",
        },
        fetchWithDesktopSession as typeof fetch,
      );
      console.log(
        ">>> [Xiaohongshu] Desktop-side drag fallback result:",
        JSON.stringify({
          pageUrl: pageUrl ?? String(payload.url ?? ""),
          noteId: noteId ?? null,
          mediaType: mediaType ?? null,
          ...summarizeXiaohongshuResolutionForLogs(resolvedViaDesktopFallback),
        }),
      );
      const extensionHintResult = resolvedViaExtension
        ? {
            kind: resolvedViaExtension.kind === "video" || resolvedViaExtension.kind === "image"
              ? resolvedViaExtension.kind
              : "unknown",
            pageUrl: resolvedViaExtension.pageUrl ?? pageUrl ?? String(payload.url ?? ""),
            imageUrl: resolvedViaExtension.imageUrl ?? imageUrl ?? null,
            videoUrl: resolvedViaExtension.videoUrl ?? null,
            videoCandidates: resolvedViaExtension.videoCandidates ?? [],
            videoIntentConfidence:
              typeof resolvedViaExtension.videoIntentConfidence === "number"
                ? resolvedViaExtension.videoIntentConfidence
                : videoIntentConfidence ?? null,
            videoIntentSources: Array.isArray(resolvedViaExtension.videoIntentSources)
              ? resolvedViaExtension.videoIntentSources
              : videoIntentSources ?? [],
            detailUrl: normalizeVideoPageUrl(resolvedViaExtension.detailUrl ?? detailUrl) ?? null,
            sourcePageUrl: normalizeVideoPageUrl(resolvedViaExtension.sourcePageUrl ?? sourcePageUrl) ?? null,
          }
        : null;

      const preferredVideoResult = resolvedViaDesktopFallback && (
        hasUsableXiaohongshuVideoMedia(resolvedViaDesktopFallback)
        || resolvedViaDesktopFallback.kind === "video"
      )
        ? resolvedViaDesktopFallback
        : extensionHintResult && (
          extensionHintResult.kind === "video"
          || hasUsableXiaohongshuVideoMedia(extensionHintResult)
          || normalizeVideoPageUrl(extensionHintResult.detailUrl ?? undefined)
        )
          ? extensionHintResult
          : resolvedViaDesktopFallback;

      if (
        shouldAttemptXiaohongshuHiddenDetailResolution({
          pageUrl,
          detailUrl:
            normalizeVideoPageUrl(detailUrl ?? resolvedViaExtension?.detailUrl)
            ?? undefined,
          noteId,
          mediaType,
          videoIntentConfidence: typeof preferredVideoResult?.videoIntentConfidence === "number"
            ? preferredVideoResult.videoIntentConfidence
            : videoIntentConfidence ?? 0,
          resolvedMedia: preferredVideoResult,
        })
      ) {
        const resolvedViaHiddenDetail = await resolveXiaohongshuViaHiddenDetailPage({
          pageUrl: preferredVideoResult?.pageUrl ?? pageUrl ?? String(payload.url ?? ""),
          noteId,
          imageUrl: preferredVideoResult?.imageUrl ?? imageUrl ?? null,
          cookies: extensionCookies,
          detailUrl: normalizeVideoPageUrl(detailUrl ?? resolvedViaExtension?.detailUrl) ?? undefined,
          sourcePageUrl: normalizeVideoPageUrl(sourcePageUrl ?? resolvedViaExtension?.sourcePageUrl) ?? undefined,
          videoIntentConfidence:
            typeof preferredVideoResult?.videoIntentConfidence === "number"
              ? preferredVideoResult.videoIntentConfidence
              : videoIntentConfidence ?? 0,
          videoIntentSources: Array.isArray(preferredVideoResult?.videoIntentSources)
            ? preferredVideoResult.videoIntentSources
            : videoIntentSources ?? [],
        });
        if (resolvedViaHiddenDetail) {
          console.log(
            ">>> [Xiaohongshu] Hidden detail-page drag fallback result:",
            JSON.stringify({
              pageUrl: pageUrl ?? String(payload.url ?? ""),
              noteId: noteId ?? null,
              mediaType: mediaType ?? null,
              cookiesPresent: Boolean(extensionCookies),
              ...summarizeXiaohongshuResolutionForLogs(resolvedViaHiddenDetail),
            }),
          );
          return resolvedViaHiddenDetail;
        }
      }

      return preferredVideoResult;
    }
    default:
      throw new Error(`Unsupported Electron command: ${command}`);
  }
}

function registerIpcHandlers() {
  ipcMain.handle("ameow:command:invoke", async (_event, request) => {
    return handleCommand(request.command, request.payload);
  });

  ipcMain.handle("ameow:event:emit", async (_event, request) => {
    emitAppEvent(request.event, request.payload);
  });

  ipcMain.handle(VALIDATE_DROPPED_FOLDER_PATH_CHANNEL, async (_event, request) => (
    validateDroppedFolderPath({ path: request?.path })
  ));

  ipcMain.handle("ameow:window:has", (_event, request) => {
    const win = getWindow(request.label);
    return Boolean(win && !win.isDestroyed());
  });

  ipcMain.handle("ameow:window:focus", async (_event, request) => {
    const win = getWindow(request.label);
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  ipcMain.handle("ameow:window:close", async (_event, request) => {
    const win = getWindow(request.label);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  ipcMain.handle("ameow:window:open-settings", async (_event, request) => {
    await openSecondaryWindow(WINDOW_LABELS.settings, request.options);
  });

  ipcMain.handle("ameow:window:open-context-menu", async (_event, request) => {
    await openSecondaryWindow(WINDOW_LABELS.contextMenu, request.options);
  });

  ipcMain.handle("ameow:window:open-ui-lab", async (_event, request) => {
    assertUiLabEnabled();
    await openSecondaryWindow(WINDOW_LABELS.uiLab, request.options);
  });

  ipcMain.handle("ameow:current-window:outer-position", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      throw new Error("Current window not found");
    }
    const [x, y] = win.getPosition();
    return { x, y };
  });

  ipcMain.handle("ameow:current-window:outer-size", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      throw new Error("Current window not found");
    }
    const [width, height] = win.getSize();
    return { width, height };
  });

  ipcMain.handle("ameow:current-window:scale-factor", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      throw new Error("Current window not found");
    }
    const display = screen.getDisplayMatching(win.getBounds());
    return display.scaleFactor;
  });

  ipcMain.handle("ameow:current-window:start-dragging", () => {
    return;
  });

  ipcMain.handle("ameow:current-window:renderer-ready", (event) => {
    const matchedPendingWindow = startupDiagnosticsController.resolveRendererReadySignal(event.sender.id, {
      url: event.sender.getURL(),
    });
    void queueStartupDiagnostic("WindowDiag", "ipc:renderer-ready", {
      senderId: event.sender.id,
      url: event.sender.getURL(),
      matchedPendingWindow,
    });
  });

  ipcMain.on("ameow:current-window:set-position", (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return;
    }

    const x = Number(payload?.x);
    const y = Number(payload?.y);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      return;
    }

    win.setPosition(Math.round(x), Math.round(y));
  });

  ipcMain.on("ameow:current-window:set-interaction-mode", (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return;
    }

    const mode = payload?.mode;
    if (mode === "compact-passthrough") {
      win.setIgnoreMouseEvents(true, { forward: true });
      win.setFocusable(false);
      return;
    }

    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
  });

  ipcMain.handle("ameow:current-window:animate-bounds", async (event, request) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      throw new Error("Current window not found");
    }

    const currentBounds = win.getBounds();
    await animateBrowserWindowBounds(win, {
      x: request?.bounds?.x ?? currentBounds.x,
      y: request?.bounds?.y ?? currentBounds.y,
      width: request?.bounds?.width ?? currentBounds.width,
      height: request?.bounds?.height ?? currentBounds.height,
    }, {
      durationMs: request?.options?.durationMs,
    });

    return {
      transitionToken:
        typeof request?.options?.transitionToken === "number"
          ? request.options.transitionToken
          : null,
    };
  });

  ipcMain.handle("ameow:current-window:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.handle("ameow:current-window:hide", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.hide();
  });

  ipcMain.handle("ameow:system:current-monitor", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return null;
    }
    const display = screen.getDisplayMatching(win.getBounds());
    return {
      position: {
        x: display.workArea.x,
        y: display.workArea.y,
      },
      size: {
        width: display.workArea.width,
        height: display.workArea.height,
      },
      scaleFactor: display.scaleFactor,
    };
  });

  ipcMain.handle("ameow:system:open-dialog", (event, request) =>
    openDialogForEvent(event, request.options));
  ipcMain.handle("ameow:system:open-external", async (_event, request) => {
    await shell.openExternal(request.url);
  });
  ipcMain.handle("ameow:system:relaunch", () => {
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle("ameow:clipboard:read-image", () => readClipboardImage());
  ipcMain.handle("ameow:updater:check", () => checkForAppUpdate());
  ipcMain.handle("ameow:updater:download-and-install", () =>
    downloadAndInstallAppUpdate());
}

function registerWsServer() {
  if (wsServer) {
    return wsServer;
  }

  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: WS_PORT,
  });
  wsServer = server;

  server.on("connection", (client) => {
    wsClients.add(client);
    client.send(JSON.stringify({ action: "request_download_preferences" }));

    client.on("message", async (message) => {
      const response = await handleWsMessage(message);
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(response));
      }
    });

    client.on("close", () => {
      wsClients.delete(client);
    });
    client.on("error", (error) => {
      wsClients.delete(client);
      console.error(">>> [WS] Client error:", error);
    });
  });

  server.on("listening", () => {
    logInfo("WS", "Server started", "ws://127.0.0.1:39527");
  });
  server.on("close", () => {
    wsServer = null;
  });
  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.error(">>> [WS] Server port already in use: 127.0.0.1:39527");
      return;
    }
    console.error(">>> [WS] Server error:", error);
  });

  return server;
}

async function bootstrap() {
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    void showMainWindow();
  });

  app.on("will-quit", () => {
    app.isQuitting = true;
    globalShortcut.unregisterAll();
    for (const task of getElectronDownloadRuntime().getQueueDetail().tasks) {
      if (task.status === "active") {
        void getElectronDownloadRuntime().cancelDownload(task.traceId);
      }
    }
    for (const task of getElectronDownloadRuntime().getTranscodeQueueDetail().tasks) {
      if (task.status === "active") {
        void getElectronDownloadRuntime().cancelTranscode(task.traceId);
      }
    }
    for (const pending of pendingProtectedImageRequests.values()) {
      clearTimeout(pending.timeoutId);
      pending.rejectResolution(new Error("Ameow is shutting down"));
    }
    pendingProtectedImageRequests.clear();
    getExtensionRequestBridge().rejectAllPendingRequests(new Error("Ameow is shutting down"));
    for (const pending of pendingXiaohongshuDragRequests.values()) {
      clearTimeout(pending.timeoutId);
      pending.rejectResolution(new Error("Ameow is shutting down"));
    }
    pendingXiaohongshuDragRequests.clear();
    if (wsServer) {
      wsServer.close();
      wsServer = null;
    }
  });

  await app.whenReady();
  applyMacTrayAppMode(app);
  registerIpcHandlers();
  registerWsServer();
  await ensureUserDataDirs();
  await initializeRuntimeLogCapture();
  if (startupDiagnosticsEnabled) {
    await writeFile(getStartupDiagnosticsPath(), "", "utf8");
    await queueStartupDiagnostic("StartupDiag", "bootstrap-environment", {
      appVersion: app.getVersion(),
      appName: app.getName(),
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
      execPath: process.execPath,
      argv: process.argv.slice(1),
      forceOpaquePackagedWindow,
      userDataDir: getUserDataDir(),
      logsDir: getLogsDir(),
      configPath: getConfigPath(),
    });
  }
  if (!app.isPackaged) {
    await showMainWindow({
      preserveExistingBounds: process.platform === "win32",
    });
    void runDeferredDevStartupTasks();
  } else {
    const startupConfigSnapshot = await readStartupConfigSnapshot();
    const trayMenuPromise = updateTrayMenu(startupConfigSnapshot);
    const shortcutPromise = registerShortcutFromConfig(startupConfigSnapshot);
    await showMainWindow({
      preserveExistingBounds: process.platform === "win32",
      startupConfigSnapshot,
    });
    await Promise.all([trayMenuPromise, shortcutPromise]);
  }
  if (startupDiagnosticsEnabled) {
    setTimeout(() => {
      void openSecondaryWindow(WINDOW_LABELS.settings, {
        title: "Settings",
        width: SETTINGS_WINDOW_WIDTH,
        height: SETTINGS_WINDOW_HEIGHT,
        alwaysOnTop: true,
        focus: true,
      }).catch((error) => {
        void queueStartupDiagnostic("WindowDiag", "settings:diagnostic-open-failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, STARTUP_DIAGNOSTIC_SETTINGS_OPEN_DELAY_MS);
  }
}

void bootstrap().catch((error) => {
  console.error(">>> [Electron] Bootstrap failed:", error);
  app.exit(1);
});
