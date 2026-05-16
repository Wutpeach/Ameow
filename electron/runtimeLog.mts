import { existsSync } from "node:fs";
import {
  appendFile,
  readFile,
  writeFile,
} from "node:fs/promises";

type ConsoleLevel = "log" | "info" | "warn" | "error";

type RuntimeLogConsole = Pick<Console, ConsoleLevel>;

type RuntimeLogFs = {
  appendFile: typeof appendFile;
  existsSync: typeof existsSync;
  readFile: typeof readFile;
  writeFile: typeof writeFile;
};

export type RuntimeLogControllerOptions = {
  getRuntimeLogPath(): string;
  getAppVersion(): string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  isPackaged: boolean;
  bufferLimit?: number;
  exportedLineLimit?: number;
  consoleRef?: RuntimeLogConsole;
  fs?: RuntimeLogFs;
  now?(): Date;
};

const defaultFs: RuntimeLogFs = {
  appendFile,
  existsSync,
  readFile,
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

const serializeRuntimeLogArgument = (argument: unknown): string => {
  if (argument instanceof Error) {
    return argument.stack || argument.message;
  }
  if (typeof argument === "string") {
    return argument;
  }
  return serializeDiagnosticPayload(argument);
};

export const createRuntimeLogController = (options: RuntimeLogControllerOptions) => {
  const logConsole = options.consoleRef ?? console;
  const fsApi = options.fs ?? defaultFs;
  const bufferLimit = options.bufferLimit ?? 1500;
  const exportedLineLimit = options.exportedLineLimit ?? 800;
  let writeChain = Promise.resolve();
  let captureInitialized = false;
  let originalConsoleStreamsAvailable = true;
  const buffer: string[] = [];
  const originalConsole: RuntimeLogConsole = {
    log: logConsole.log.bind(logConsole),
    info: logConsole.info.bind(logConsole),
    warn: logConsole.warn.bind(logConsole),
    error: logConsole.error.bind(logConsole),
  };

  const currentDate = () => options.now?.() ?? new Date();

  const isConsoleStreamWriteError = (error: unknown) => {
    if (!error || typeof error !== "object") {
      return false;
    }

    const code = (error as { code?: unknown }).code;
    return code === "EIO"
      || code === "EPIPE"
      || code === "ERR_STREAM_DESTROYED";
  };

  const safeWriteOriginalConsole = (level: ConsoleLevel, ...args: unknown[]) => {
    if (!originalConsoleStreamsAvailable) {
      return;
    }

    try {
      originalConsole[level](...args);
    } catch (error) {
      if (isConsoleStreamWriteError(error)) {
        originalConsoleStreamsAvailable = false;
        return;
      }
      throw error;
    }
  };

  const formatLine = (level: string, message: string) => (
    `[${currentDate().toISOString()}] [${level}] ${message}`
  );

  const appendRuntimeLogLine = (level: string, message: unknown) => {
    const trimmedMessage = String(message ?? "").trim();
    if (!trimmedMessage) {
      return Promise.resolve();
    }

    const line = formatLine(level, trimmedMessage);
    buffer.push(line);
    if (buffer.length > bufferLimit) {
      buffer.splice(0, buffer.length - bufferLimit);
    }

    writeChain = writeChain
      .catch(() => undefined)
      .then(async () => {
        try {
          await fsApi.appendFile(options.getRuntimeLogPath(), `${line}\n`, "utf8");
        } catch (error) {
          safeWriteOriginalConsole("error", ">>> [RuntimeLog] Failed to append log:", error);
        }
      });
    return writeChain;
  };

  const captureConsoleRuntimeLog = (level: ConsoleLevel, args: unknown[]) => {
    const message = args
      .map((argument) => serializeRuntimeLogArgument(argument))
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!message) {
      return;
    }
    void appendRuntimeLogLine(level, message);
  };

  const initializeRuntimeLogCapture = async () => {
    if (captureInitialized) {
      return;
    }

    captureInitialized = true;
    buffer.length = 0;
    const sessionHeader = formatLine(
      "session",
      [
        "Ameow runtime log started",
        `version=${options.getAppVersion()}`,
        `platform=${options.platform}`,
        `arch=${options.arch}`,
        `packaged=${options.isPackaged}`,
      ].join(" "),
    );

    try {
      await fsApi.writeFile(options.getRuntimeLogPath(), `${sessionHeader}\n`, "utf8");
      buffer.push(sessionHeader);
    } catch (error) {
      safeWriteOriginalConsole("error", ">>> [RuntimeLog] Failed to initialize runtime log:", error);
    }

    logConsole.log = (...args: unknown[]) => {
      safeWriteOriginalConsole("log", ...args);
      captureConsoleRuntimeLog("log", args);
    };
    logConsole.info = (...args: unknown[]) => {
      safeWriteOriginalConsole("info", ...args);
      captureConsoleRuntimeLog("info", args);
    };
    logConsole.warn = (...args: unknown[]) => {
      safeWriteOriginalConsole("warn", ...args);
      captureConsoleRuntimeLog("warn", args);
    };
    logConsole.error = (...args: unknown[]) => {
      safeWriteOriginalConsole("error", ...args);
      captureConsoleRuntimeLog("error", args);
    };
  };

  const readRecentRuntimeLogLines = async (limit = exportedLineLimit) => {
    const fallbackLines = buffer.slice(-limit);

    try {
      await writeChain.catch(() => undefined);
      if (!fsApi.existsSync(options.getRuntimeLogPath())) {
        return fallbackLines;
      }
      const raw = await fsApi.readFile(options.getRuntimeLogPath(), "utf8");
      const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean);
      return lines.slice(-limit);
    } catch (error) {
      safeWriteOriginalConsole("error", ">>> [RuntimeLog] Failed to read runtime log:", error);
      return fallbackLines;
    }
  };

  return {
    appendRuntimeLogLine,
    initializeRuntimeLogCapture,
    readRecentRuntimeLogLines,
  };
};
