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
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";
import {
  buildWindowsAutostartSettings,
  getWindowsAutostartQuery,
  isWindowsAutostartEnabled,
} from "./autostart.mjs";
import {
  allocateRenameStem,
  createElectronDownloadRuntime,
  inspectRuntimeDependencyStatus,
  releaseRenameStem,
  resolveBundledPythonRuntime,
  resetRenameSequenceState,
  resolveXiaohongshuDragMedia,
  resolveRuntimeBinaryPaths,
  resolveRenameEnabled,
} from "../src/electron-runtime/index.js";
import {
  normalizeVideoQualityPreference,
  resolveYtdlpQualityPreferenceFromConfig,
} from "../src/core/index.js";
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
import { applyConfiguredProxyToSession } from "./desktopProxy.mjs";
import { waitForInitialWindowReveal } from "./windowRevealWait.mjs";
import { applyMacTrayAppMode } from "./macAppVisibility.mjs";
import { openPathOrThrow } from "./openPath.mjs";
import {
  createMainWindowPointerBoundaryController,
  MAIN_WINDOW_POINTER_BOUNDARY_CHANNEL,
} from "./mainWindowPointerBoundary.mjs";
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
import {
  buildVideoSelectedV2QueuePayload,
  createVideoDownloadCommandBridge,
} from "./videoDownloadCommands.mjs";
import { dispatchRendererCommandToControllers } from "./rendererCommandControllerRegistry.mjs";
import {
  createSiteSessionCommandController,
  resolveSiteSessionIdFromPayload,
} from "./siteSessionCommands.mjs";
import { createSupportLogCommandController } from "./supportLogCommands.mjs";
import { buildXiaohongshuResolvedDragMediaResult } from "./xiaohongshuDragMediaResult.mjs";
import {
  currentManagedRuntimeTarget,
  ensureManagedDenoRuntimeReady,
  ensureManagedFfmpegRuntimeReady,
  ensureManagedDouyinDlRuntimeReady,
  ensureManagedGalleryDlRuntimeReady,
  ensureManagedYtDlpRuntimeReady,
  managedDouyinDlRuntimePaths,
  resolvePinnedManagedPythonPackage,
} from "./managedRuntimeBootstrap.mjs";
import { createSiteSessionManager } from "./siteSessionManager.mjs";
import { createSiteSessionRegistry } from "./siteSessionRegistry.mjs";
import { handleAuthRequiredSiteSessionRecovery } from "./siteSessionAuthRecovery.mjs";
import { createRuntimeDependencyGateController } from "./runtimeDependencyGate.mjs";
import { createRuntimeLogController } from "./runtimeLog.mjs";
import {
  createStartupDiagnosticsController,
  summarizeCapturedImage,
} from "./startupDiagnostics.mjs";
import { exportSupportLogFile } from "./supportLogExport.mjs";
import {
  createConfigStore,
  parseJsonObject,
} from "./configStore.mjs";
import {
  createTrayMenuController,
  resolveTrayIconPath,
} from "./trayMenu.mjs";
import {
  buildRendererRoute as buildRendererRouteUrl,
  resolveSecondaryWindowOpenOptions as resolveAnchoredSecondaryWindowOpenOptions,
  secondaryWindowRoute as resolveSecondaryWindowRoute,
} from "./windowRouting.mjs";
import { createUiLabScenariosController } from "./uiLabScenarios.mjs";
import {
  downloadImage as saveDownloadedImage,
  ensureExtension,
  saveDataUrl as saveImageDataUrl,
} from "./imageDownload.mjs";
import {
  getClipboardFilePaths as readClipboardFilePaths,
  processFiles as processIncomingFiles,
} from "./fileIntake.mjs";

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
const UI_LAB_VIDEO_QUEUE_MAX_CONCURRENT = 3;
const RENDERER_READY_TIMEOUT_MS = 2_500;
const WINDOW_STARTUP_CAPTURE_DELAY_MS = 180;
const STARTUP_DIAGNOSTIC_SETTINGS_OPEN_DELAY_MS = 1_500;
const MACOS_TRAY_ICON_SIZE_PX = 18;
const DOCS_SCREENSHOT_TARGET_ENV = "AMEOW_DOCS_SCREENSHOT_TARGET";
const DOCS_SCREENSHOT_OUTPUT_ENV = "AMEOW_DOCS_SCREENSHOT_OUTPUT";
const DOCS_SCREENSHOT_DEVICE_SCALE_FACTOR_ENV = "AMEOW_DOCS_SCREENSHOT_DEVICE_SCALE_FACTOR";
const DOCS_SCREENSHOT_USER_DATA_ENV = "AMEOW_DOCS_SCREENSHOT_USER_DATA";
const DOCS_SCREENSHOT_CAPTURE_DELAY_MS = 600;
const DOCS_SCREENSHOT_EXPANDED_CAPTURE_DELAY_MS = 1_000;
const DOCS_SCREENSHOT_SETTINGS_CAPTURE_DELAY_MS = 900;
const DOCS_SCREENSHOT_UI_LAB_APPLY_DELAY_MS = 800;
let registeredShortcut = "";
let lastShortcutTriggerMs = 0;
let electronDownloadRuntime = null;
let extensionRequestBridge = null;
let videoDownloadCommandBridge = null;
let siteSessionCommandController = null;
let supportLogCommandController = null;
const siteSessionManagers = new Map();
let siteSessionRegistry = null;
let nextOpaqueSequence = 1;
let hasShownMainWindowOnce = false;
let mainWindowUsesTransparentShell = false;
let mainWindowPointerBoundaryController = null;

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
  ensureManagedDouyinDlRuntimeReady,
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

if (process.env[DOCS_SCREENSHOT_TARGET_ENV]) {
  const deviceScaleFactor = String(process.env[DOCS_SCREENSHOT_DEVICE_SCALE_FACTOR_ENV] ?? "3").trim();
  app.commandLine.appendSwitch("force-device-scale-factor", deviceScaleFactor);
  const userDataPath = String(process.env[DOCS_SCREENSHOT_USER_DATA_ENV] ?? "").trim();
  if (userDataPath) {
    app.setPath("userData", resolve(userDataPath));
  }
}

const forceOpaquePackagedWindow = shouldUsePackagedWindowsOpaqueWindow({
  platform: process.platform,
  isPackaged: app.isPackaged,
  argv: process.argv,
  env: process.env,
});

const configStore = createConfigStore({
  getUserDataDir() {
    return app.getPath("userData");
  },
  getDesktopDir() {
    return app.getPath("desktop");
  },
  getLocale() {
    return app.getLocale();
  },
  logDirName: LOG_DIR_NAME,
  defaultOutputFolderName: DEFAULT_OUTPUT_FOLDER_NAME,
  fallbackTheme: FALLBACK_THEME,
  languageChangedEventName: LANGUAGE_CHANGED_EVENT,
  emitAppEvent,
  broadcastWsMessage,
  refreshTrayMenu(startupConfigSnapshot) {
    return updateTrayMenu(startupConfigSnapshot);
  },
  onTrayRefreshError(error) {
    console.error(">>> [Electron] Failed to refresh tray language:", error);
  },
});
const buildStartupConfigSnapshot = configStore.buildStartupConfigSnapshot;
const ensureUserDataDirs = configStore.ensureUserDataDirs;
const getConfigPath = configStore.getConfigPath;
const getLogsDir = configStore.getLogsDir;
const getUserDataDir = configStore.getUserDataDir;
const readConfigObject = configStore.readConfigObject;
const readConfigString = configStore.readConfigString;
const readCurrentLanguage = configStore.readCurrentLanguage;
const readCurrentTheme = configStore.readCurrentTheme;
const readStartupConfigSnapshot = configStore.readStartupConfigSnapshot;
const resolveCurrentOutputFolderPath = configStore.resolveCurrentOutputFolderPath;
const resolveExtensionInjectionDebugEnabledFromConfigObject =
  configStore.resolveExtensionInjectionDebugEnabledFromConfigObject;
const resolveLanguageFromConfigString = configStore.resolveLanguageFromConfigString;
const resolveThemeFromConfigObject = configStore.resolveThemeFromConfigObject;
const saveConfigString = configStore.saveConfigString;

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

const trayMenuController = createTrayMenuController({
  repoRoot,
  resourcesPath: process.resourcesPath,
  platform: process.platform,
  fallbackLanguage: FALLBACK_LANGUAGE,
  macosTrayIconSizePx: MACOS_TRAY_ICON_SIZE_PX,
  settingsWindow: {
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
  },
  windowLabels: {
    settings: WINDOW_LABELS.settings,
  },
  readCurrentLanguage,
  showMainWindow,
  openSettingsWindow(options) {
    return openSecondaryWindow(WINDOW_LABELS.settings, options);
  },
  quitApp() {
    app.isQuitting = true;
    app.quit();
  },
  logLocaleReadError(error) {
    console.error(">>> [Electron] Failed to read native locale:", error);
  },
  nativeImage,
  Menu,
  Tray,
});
const updateTrayMenu = trayMenuController.updateTrayMenu;

function getIconPath() {
  return resolveTrayIconPath(process.platform, repoRoot);
}

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

function resolveDocsScreenshotRequest() {
  const target = String(process.env[DOCS_SCREENSHOT_TARGET_ENV] ?? "").trim();
  if (!target) {
    return null;
  }

  const outputPath = String(process.env[DOCS_SCREENSHOT_OUTPUT_ENV] ?? "").trim();
  if (!outputPath) {
    throw new Error(`${DOCS_SCREENSHOT_OUTPUT_ENV} is required when ${DOCS_SCREENSHOT_TARGET_ENV} is set.`);
  }

  return {
    target,
    outputPath: resolve(outputPath),
  };
}

function resolveDocsScreenshotSettingsPage(target: string): string | null {
  const match = target.match(/^desktop-settings-(hub|appearance|saving|sites|plugins|system)$/);
  return match?.[1] ?? null;
}

function resolveDocsScreenshotUiLabScenario(target: string): string | null {
  switch (target) {
    case "desktop-download-active":
      return "download-active";
    case "desktop-transcode-active":
      return "transcode-active";
    default:
      return null;
  }
}

async function writeDocsScreenshot(win: BrowserWindow, request: {
  target: string;
  outputPath: string;
}) {
  if (win.isDestroyed()) {
    throw new Error(`Cannot capture docs screenshot because ${request.target} window was destroyed.`);
  }

  const image = await win.webContents.capturePage();
  const summary = summarizeCapturedImage(image);
  if (summary.nonTransparentRatio < 0.01) {
    throw new Error(`Docs screenshot capture appears blank: ${JSON.stringify(summary)}`);
  }

  await mkdir(dirname(request.outputPath), { recursive: true });
  await writeFile(request.outputPath, image.toPNG());
  console.log(JSON.stringify({
    target: request.target,
    outputPath: request.outputPath,
    summary,
  }, null, 2));
}

async function applyDocsScreenshotUiLabScenario(win: BrowserWindow, scenario: string) {
  await win.webContents.executeJavaScript(`
    window.ameow.commands.invoke("dev_ui_lab_apply_scenario", ${JSON.stringify({ scenario })})
  `);
}

async function captureDocsScreenshotAndQuit(win: BrowserWindow, request: {
  target: string;
  outputPath: string;
}) {
  const uiLabScenario = resolveDocsScreenshotUiLabScenario(request.target);
  if (![
    "desktop-floating-window-idle",
    "desktop-main-window-expanded",
    "desktop-download-active",
    "desktop-transcode-active",
  ].includes(request.target)) {
    throw new Error(`Unsupported docs screenshot target: ${request.target}`);
  }

  if (request.target === "desktop-main-window-expanded" || uiLabScenario) {
    mainWindowPointerBoundaryController?.stop();
    win.webContents.sendInputEvent({
      type: "mouseMove",
      x: 40,
      y: 40,
      movementX: 0,
      movementY: 0,
    });
    win.webContents.send(MAIN_WINDOW_POINTER_BOUNDARY_CHANNEL, { inside: true });
  }

  if (uiLabScenario) {
    await new Promise((resolveDelay) => {
      setTimeout(resolveDelay, DOCS_SCREENSHOT_UI_LAB_APPLY_DELAY_MS);
    });
    await applyDocsScreenshotUiLabScenario(win, uiLabScenario);
  }

  await new Promise((resolveDelay) => {
    setTimeout(
      resolveDelay,
      request.target === "desktop-main-window-expanded" || uiLabScenario
        ? DOCS_SCREENSHOT_EXPANDED_CAPTURE_DELAY_MS
        : DOCS_SCREENSHOT_CAPTURE_DELAY_MS,
    );
  });

  await writeDocsScreenshot(win, request);
  app.isQuitting = true;
  app.quit();
}

async function captureDocsSettingsScreenshotAndQuit(request: {
  target: string;
  outputPath: string;
}) {
  const page = resolveDocsScreenshotSettingsPage(request.target);
  if (!page) {
    throw new Error(`Unsupported docs settings screenshot target: ${request.target}`);
  }

  await showMainWindow({
    preserveExistingBounds: process.platform === "win32",
  });
  const settingsWindow = await openSecondaryWindow(WINDOW_LABELS.settings, {
    title: "Settings",
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    alwaysOnTop: true,
    focus: true,
    center: true,
  }, {
    routePath: `/settings?docsPage=${page}`,
  });

  await new Promise((resolveDelay) => {
    setTimeout(resolveDelay, DOCS_SCREENSHOT_SETTINGS_CAPTURE_DELAY_MS);
  });

  await writeDocsScreenshot(settingsWindow, request);
  app.isQuitting = true;
  app.quit();
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

function keepMainWindowOffWindowsTaskbar(win: BrowserWindow) {
  if (process.platform !== "win32" || win.isDestroyed()) {
    return;
  }

  win.setSkipTaskbar(true);
}

function shouldToggleFocusabilityForInteractionMode() {
  return process.platform !== "win32";
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

async function applyConfiguredDesktopProxy(config = null) {
  const activeSession = getDesktopNetworkSession();
  if (!activeSession?.setProxy) {
    return;
  }

  const resolvedConfig = config ?? await readConfigObject();
  const result = await applyConfiguredProxyToSession(activeSession, resolvedConfig);
  if (result.mode === "system") {
    logInfo("Network", "Using system proxy settings");
    return;
  }

  logInfo("Network", "Applied configured global proxy", result.proxyRules);
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

function nowTimestampMs() {
  return Date.now();
}

function summarizeInjectedVideoSelectionPayload(payload) {
  const normalizedTitle = normalizeOptionalString(payload?.title);
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
    extensionData: normalizedExtensionData,
    videoCandidateCount: normalizedVideoCandidates.length,
    clipStartSec: normalizeOptionalNumber(payload?.clipStartSec ?? payload?.clip_start_sec) ?? null,
    clipEndSec: normalizeOptionalNumber(payload?.clipEndSec ?? payload?.clip_end_sec) ?? null,
    videoQuality:
      normalizeVideoQualityPreference(payload?.videoQuality)
      ?? normalizeVideoQualityPreference(payload?.defaultVideoDownloadQuality)
      ?? null,
  };
}

function logInjectedVideoSelectionDebug(config, message, payload) {
  if (!resolveExtensionInjectionDebugEnabledFromConfigObject(config)) {
    return;
  }

  logInfo("InjectedVideoSelection", message, serializeDiagnosticPayload(payload));
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

function normalizeSelectionScope(value) {
  return value === "current_item" || value === "playlist" ? value : "auto";
}

function resolveVideoDownloadPreferencesFromConfig(config) {
  return {
    videoQuality: resolveYtdlpQualityPreferenceFromConfig(config),
    aeFriendlyConversionEnabled: config.aeFriendlyConversionEnabled === true,
  };
}

async function syncIncomingDownloadPreferences(data) {
  const incomingQuality = normalizeVideoQualityPreference(
    normalizeOptionalString(data?.videoQuality)
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
    quality: merged.videoQuality,
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

const fileIntakeDependencies = {
  readConfigObject,
  resolveCurrentOutputFolderPath,
  resolveRenameEnabled,
  buildRenamedTargetPath,
  releaseRenameStem,
};

async function getClipboardFilePaths() {
  return readClipboardFilePaths(clipboard);
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
    resourceDir: app.isPackaged ? process.resourcesPath : null,
    executableDir: dirname(process.execPath),
    desktopDir: app.getPath("desktop"),
    tempDir: tmpdir(),
    platform: process.platform,
    arch: process.arch,
    fetch: fetchWithDesktopSession,
  };
}

function buildManagedRuntimeBootstrapOptions(_missingComponents = [], onActivity = null) {
  const environment = buildElectronRuntimeEnvironment();
  const bundledPython = resolveBundledPythonRuntime(environment);
  return {
    configDir: getUserDataDir(),
    platform: process.platform,
    arch: process.arch,
    fetch: fetchWithDesktopSession,
    bundledPythonRoot: bundledPython.root,
    bundledPythonPath: bundledPython.executable,
    missingComponents: _missingComponents,
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
    ensureEngineRuntimeReady: async (engineId, reason) => {
      const options = buildManagedRuntimeBootstrapOptions();
      if (engineId === "yt-dlp") {
        await ensureManagedYtDlpRuntimeReady(reason, options);
        await ensureManagedFfmpegRuntimeReady(reason, options);
        await ensureManagedDenoRuntimeReady(reason, options);
        return;
      }
      if (engineId === "gallery-dl") {
        await ensureManagedGalleryDlRuntimeReady(reason, options);
        return;
      }
      if (engineId === "douyin-dl") {
        await ensureManagedDouyinDlRuntimeReady(reason, options);
        return;
      }
    },
    bootstrapManagedComponents: async ({ reason }) => {
      await ensureMissingManagedRuntimesReady(reason || "electron_runtime");
      return getRuntimeDependencyStatus();
    },
    buildExecutionContext(context) {
      const appOwnedCookies = getSiteSessionManager(context.intent.siteId)?.getDownloadCookies() ?? null;
      return {
        ...context,
        intent: appOwnedCookies
          ? {
              ...context.intent,
              cookies: appOwnedCookies,
            }
            : context.intent,
        userDataDir: getUserDataDir(),
      };
    },
    handleAuthRequiredFailure(context) {
      return handleAuthRequiredSiteSessionRecovery(context, {
        registry: getSiteSessionRegistry(),
        syncSiteSession(siteId) {
          return syncSiteSessionFromExtension(siteId, requireSiteSessionManager(siteId));
        },
        onRegistryChanged() {
          broadcastSiteSessionRegistryUpdate();
          void broadcastSiteSessionPendingActions();
        },
        log(message, details) {
          logInfo("SiteSessionAuth", message, details ?? null);
        },
      });
    },
  });
  return electronDownloadRuntime;
}

function getSiteSessionRegistry() {
  if (siteSessionRegistry) {
    return siteSessionRegistry;
  }
  siteSessionRegistry = createSiteSessionRegistry({
    getUserDataDir,
  });
  return siteSessionRegistry;
}

function getSiteSessionManager(siteId) {
  const entry = getSiteSessionRegistry().getEntry(siteId);
  if (!entry) {
    return null;
  }
  const cachedManager = siteSessionManagers.get(siteId);
  if (cachedManager) {
    return cachedManager;
  }

  const manager = createSiteSessionManager({
    site: {
      id: entry.siteId,
      displayName: entry.displayName,
      cookieDomains: [...entry.cookieDomains],
      requiredCookieKeys: [...entry.requiredCookieKeys],
      loginCookieKeys: [...entry.loginCookieKeys],
    },
    getUserDataDir,
  });
  siteSessionManagers.set(siteId, manager);
  return manager;
}

function requireSiteSessionManager(siteId) {
  const manager = getSiteSessionManager(siteId);
  if (!manager) {
    throw new Error(`Unsupported site session: ${siteId ?? ""}`);
  }
  return manager;
}

function isHttpNavigationUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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
      console.log(`>>> [ExtensionBridge] ${message}:`, JSON.stringify(details ?? null));
    },
  });
  return extensionRequestBridge;
}

async function syncSiteSessionFromExtension(siteId, manager) {
  const entry = getSiteSessionRegistry().requireEntry(siteId);
  const resolution = await getExtensionRequestBridge().requestSiteSessionCookieSync({
    siteId,
    cookieDomains: entry.cookieDomains,
  });

  if (!resolution.success) {
    throw new Error(resolution.error || resolution.code || "Browser extension site session sync failed");
  }
  if (resolution.siteId !== siteId) {
    throw new Error(`Browser extension returned site session for ${resolution.siteId || "unknown"} instead of ${siteId}`);
  }

  const nextState = await manager.importSnapshot({
    cookies: resolution.cookies,
    source: resolution.source ?? null,
  });

  if (nextState.lastError) {
    throw new Error(nextState.lastError);
  }

  broadcastSiteSessionRegistryUpdate();
  void broadcastSiteSessionPendingActions();
  return nextState;
}

async function buildSiteSessionPendingActionsPayload() {
  const entries = [];
  for (const entry of getSiteSessionRegistry().listVisibleEntries()) {
    if (entry.syncAuthorization !== "auto_discovered") {
      continue;
    }
    const state = await requireSiteSessionManager(entry.siteId).getState();
    if (state.availability === "ready") {
      continue;
    }
    entries.push({
      siteId: entry.siteId,
      displayName: entry.displayName,
      primaryHost: entry.primaryHost,
    });
  }
  return {
    count: entries.length,
    entries,
  };
}

async function broadcastSiteSessionPendingActions() {
  emitAppEvent("site-session-pending-actions-changed", await buildSiteSessionPendingActionsPayload());
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

function getSiteSessionCommandController() {
  if (siteSessionCommandController) {
    return siteSessionCommandController;
  }

  siteSessionCommandController = createSiteSessionCommandController({
    listSiteSessionRegistryEntries() {
      return getSiteSessionRegistry().listVisibleEntries();
    },
    requireSiteSessionManager,
    resolveSiteSessionIdFromPayload,
    syncSiteSessionFromExtension,
  });
  return siteSessionCommandController;
}

function getSupportLogCommandController() {
  if (supportLogCommandController) {
    return supportLogCommandController;
  }

  supportLogCommandController = createSupportLogCommandController({
    exportSupportLog,
  });
  return supportLogCommandController;
}

// Order matters: first supporting controller wins.
const rendererCommandControllerGetters = [
  getVideoDownloadCommandBridge,
  getSiteSessionCommandController,
  getSupportLogCommandController,
];

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
    python: { ...snapshot.python },
    ytDlp: { ...snapshot.ytDlp },
    galleryDl: { ...snapshot.galleryDl },
    douyinDl: { ...snapshot.douyinDl },
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

const uiLabScenariosController = createUiLabScenariosController({
  emitAppEvent,
  setRuntimeOverrides: setUiLabRuntimeOverrides,
  clearRuntimeOverrides: clearUiLabRuntimeOverrides,
  getRuntimeMaxConcurrent() {
    return getElectronDownloadRuntime().maxConcurrent;
  },
  emitLiveVideoQueueState,
  getRuntimeDependencyGateState,
  nowTimestampMs,
  uiLabResetEvent: UI_LAB_RESET_EVENT,
  fallbackVideoQueueMaxConcurrent: UI_LAB_VIDEO_QUEUE_MAX_CONCURRENT,
});

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
    getLocalDownloaderVersion,
    resolvePinnedManagedPythonPackage,
    compareLooseVersions,
  });
}

async function getGalleryDlInfo() {
  return buildGalleryDlInfo({
    platform: process.platform,
    getRuntimeDependencyStatus,
    getLocalDownloaderVersion,
    resolvePinnedManagedPythonPackage,
    compareLooseVersions,
  });
}

function emitAppEvent(event, payload) {
  for (const win of windows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send(`ameow:event:${event}`, { payload });
    }
  }
}

function emitLiveVideoQueueState() {
  const runtime = getElectronDownloadRuntime();
  emitAppEvent("video-queue-count", runtime.getQueueState());
  emitAppEvent("video-queue-detail", runtime.getQueueDetail());
}

async function restoreUiLabLiveState() {
  uiLabScenarioActive = false;
  await uiLabScenariosController.restoreLiveState();
}

async function applyUiLabScenario(scenario) {
  assertUiLabEnabled();
  await showMainWindow();

  if (scenario === "reset") {
    await restoreUiLabLiveState();
    return;
  }

  uiLabScenarioActive = true;
  uiLabScenariosController.applyScenarioPreview(scenario);
}

function broadcastWsMessage(message) {
  const serialized = JSON.stringify(message);
  for (const client of wsClients) {
    if (client.readyState === client.OPEN) {
      client.send(serialized);
    }
  }
}

function buildSiteSessionRegistryPayload() {
  return {
    action: "site_session_registry_update",
    data: {
      entries: getSiteSessionRegistry().listEntries(),
    },
  };
}

function broadcastSiteSessionRegistryUpdate() {
  broadcastWsMessage(buildSiteSessionRegistryPayload());
}

function sendSiteSessionRegistryUpdate(client) {
  if (client.readyState === client.OPEN) {
    client.send(JSON.stringify(buildSiteSessionRegistryPayload()));
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

function buildRendererRoute(routePath) {
  return buildRendererRouteUrl(routePath, {
    isPackaged: app.isPackaged,
    repoRoot,
    env: process.env,
  });
}

function secondaryWindowRoute(label) {
  return resolveSecondaryWindowRoute(label, WINDOW_LABELS);
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
    if (label === WINDOW_LABELS.main) {
      mainWindowPointerBoundaryController?.dispose();
      mainWindowPointerBoundaryController = null;
    }
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
  mainWindow.on("show", () => {
    keepMainWindowOffWindowsTaskbar(mainWindow);
  });
  if (process.platform === "win32" && app.isPackaged && transparentWindow) {
    mainWindow.on("focus", () => {
      keepMainWindowOffWindowsTaskbar(mainWindow);
      applyMainWindowVisibleZOrder(mainWindow, "focus");
    });
  }
  mainWindowPointerBoundaryController = createMainWindowPointerBoundaryController({
    win: mainWindow,
    screenRef: screen,
  });

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
  keepMainWindowOffWindowsTaskbar(mainWindow);
  mainWindow.show();
  keepMainWindowOffWindowsTaskbar(mainWindow);
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
  keepMainWindowOffWindowsTaskbar(mainWindow);
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

async function openSecondaryWindow(label, options, internalOptions = {}) {
  const resolvedOptions = resolveSecondaryWindowOpenOptions(label, options);
  const existing = getWindow(label);
  if (existing && !existing.isDestroyed()) {
    showSecondaryWindow(label, existing, resolvedOptions);
    return existing;
  }

  const routePath = internalOptions.routePath ?? secondaryWindowRoute(label);
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

function resolveSecondaryWindowOpenOptions(label, options) {
  return resolveAnchoredSecondaryWindowOpenOptions(label, options, {
    labels: WINDOW_LABELS,
    getWindow,
    getDisplayWorkArea(anchorBounds) {
      return screen.getDisplayMatching(anchorBounds).workArea;
    },
    settingsGap: SETTINGS_WINDOW_GAP,
    uiLabGap: UI_LAB_WINDOW_GAP,
    edgePadding: WINDOW_EDGE_PADDING,
  });
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
    case "site_session_cookie_sync_result": {
      const result = getExtensionRequestBridge().handleSiteSessionCookieSyncResult(data);
      return {
        success: result.success,
        message: result.message,
        data: withRequest(result.success ? null : result.code),
      };
    }
    case "site_session_enable_current_tab": {
      const pageUrl = normalizeOptionalString(data?.pageUrl ?? data?.page_url);
      if (!pageUrl) {
        return {
          success: false,
          message: "Missing pageUrl",
          data: withRequest("missing_page_url"),
        };
      }
      try {
        const entry = getSiteSessionRegistry().enableCurrentTabSite({
          pageUrl,
          displayName: normalizeOptionalString(data?.displayName ?? data?.display_name),
        });
        broadcastSiteSessionRegistryUpdate();
        void broadcastSiteSessionPendingActions();
        return {
          success: true,
          message: "site_session_current_tab_enabled",
          data: withRequest(null, { entry }),
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
          data: withRequest("site_session_enable_failed"),
        };
      }
    }
    case "site_session_cookie_sync_direct": {
      const siteId = normalizeOptionalString(data?.siteId ?? data?.site_id);
      if (!siteId) {
        return {
          success: false,
          message: "Missing siteId",
          data: withRequest("missing_site_id"),
        };
      }
      try {
        const manager = requireSiteSessionManager(siteId);
        const nextState = await manager.importSnapshot({
          cookies: Array.isArray(data?.cookies) ? data.cookies : [],
          source: data?.source && typeof data.source === "object"
            ? {
                browser: normalizeOptionalString(data.source.browser) ?? null,
                profileLabel: normalizeOptionalString(data.source.profileLabel ?? data.source.profile_label) ?? null,
                extensionId: normalizeOptionalString(data.source.extensionId ?? data.source.extension_id) ?? null,
              }
            : null,
        });
        if (nextState.lastError) {
          throw new Error(nextState.lastError);
        }
        broadcastSiteSessionRegistryUpdate();
        void broadcastSiteSessionPendingActions();
        return {
          success: true,
          message: "site_session_cookie_sync_direct_received",
          data: withRequest(null, { state: nextState }),
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
          data: withRequest("site_session_cookie_sync_direct_failed"),
        };
      }
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
        const ack = await getVideoDownloadCommandBridge().invoke(
          "queue_video_download",
          buildVideoSelectedV2QueuePayload(data, {
            videoQuality: syncedPreferences?.quality,
          }),
        );
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
  const controllerResult = await dispatchRendererCommandToControllers(
    rendererCommandControllerGetters,
    command,
    payload,
  );
  if (controllerResult.handled) {
    if (command === "clear_site_session" || command === "clear_douyin_session") {
      void broadcastSiteSessionPendingActions();
    }
    return controllerResult.value;
  }

  switch (command) {
    case "get_config":
      return readConfigString();
    case "save_config": {
      const rawConfig = String(payload.json ?? "{}");
      await saveConfigString(rawConfig);
      await applyConfiguredDesktopProxy(parseJsonObject(rawConfig));
      return;
    }
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
    case "get_site_session_pending_actions":
      return buildSiteSessionPendingActionsPayload();
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
      return processIncomingFiles(
        Array.isArray(payload.paths) ? payload.paths : [],
        payload.targetDir ?? null,
        fileIntakeDependencies,
      );
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
          if (resolvedViaExtension?.success && resolvedViaExtension.kind === "video") {
            return buildXiaohongshuResolvedDragMediaResult(
              resolvedViaExtension,
              {
                requiredPageUrl: pageUrl ?? String(payload.url ?? ""),
                pageUrl,
                imageUrl,
                detailUrl,
                sourcePageUrl,
                videoIntentConfidence,
                videoIntentSources,
              },
            );
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
        ? buildXiaohongshuResolvedDragMediaResult(
            resolvedViaExtension,
            {
              requiredPageUrl: pageUrl ?? String(payload.url ?? ""),
              pageUrl,
              imageUrl,
              detailUrl,
              sourcePageUrl,
              videoIntentConfidence,
              videoIntentSources,
            },
          )
        : null;

      const preferredVideoResult = resolvedViaDesktopFallback && (
        resolvedViaDesktopFallback.kind === "video"
      )
        ? resolvedViaDesktopFallback
        : extensionHintResult && (
          extensionHintResult.kind === "video"
          || normalizeVideoPageUrl(extensionHintResult.detailUrl ?? undefined)
        )
          ? extensionHintResult
          : resolvedViaDesktopFallback;

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
      mainWindowPointerBoundaryController?.stop();
      win.setIgnoreMouseEvents(true, { forward: true });
      if (shouldToggleFocusabilityForInteractionMode()) {
        win.setFocusable(false);
      }
      keepMainWindowOffWindowsTaskbar(win);
      return;
    }

    win.setIgnoreMouseEvents(false);
    if (shouldToggleFocusabilityForInteractionMode()) {
      win.setFocusable(true);
    }
    keepMainWindowOffWindowsTaskbar(win);
    if (win === getWindow(WINDOW_LABELS.main)) {
      mainWindowPointerBoundaryController?.start();
    }
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
    sendSiteSessionRegistryUpdate(client);

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
  const docsScreenshotRequest = resolveDocsScreenshotRequest();
  const gotSingleInstanceLock = docsScreenshotRequest ? true : app.requestSingleInstanceLock();
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
    for (const manager of siteSessionManagers.values()) {
      void manager.shutdown();
    }
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
  await applyConfiguredDesktopProxy().catch((error) => {
    console.error(">>> [Electron] Failed to apply configured proxy:", error);
  });
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
    if (docsScreenshotRequest) {
      console.log(`>>> [DocsScreenshot] Capturing ${docsScreenshotRequest.target} to ${docsScreenshotRequest.outputPath}`);
      if (resolveDocsScreenshotSettingsPage(docsScreenshotRequest.target)) {
        await captureDocsSettingsScreenshotAndQuit(docsScreenshotRequest);
        return;
      }
      await showMainWindow({
        preserveExistingBounds: process.platform === "win32",
      });
      const mainWindow = getWindow(WINDOW_LABELS.main);
      if (!mainWindow) {
          throw new Error("Main window not found for docs screenshot capture.");
        }
      await captureDocsScreenshotAndQuit(mainWindow, docsScreenshotRequest);
      return;
    }
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
