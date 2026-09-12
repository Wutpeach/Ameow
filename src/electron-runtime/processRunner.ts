import { spawn, type ChildProcess, type ChildProcessByStdio } from "node:child_process";
import { join } from "node:path";
import { once } from "node:events";
import type { Readable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";

type StreamingChildProcess = ChildProcessByStdio<null, Readable, Readable>;

// Only for children spawned in an owned POSIX session (detached: true).
// A failed termination request is not proof of settlement: keep ownership.
export const terminateOwnedProcessTree = async (child: ChildProcess): Promise<void> => {
  if (!child.pid) return; // Spawn failures are still settled by the child's close event.
  if (process.platform === "win32") {
    let rootExited = child.exitCode != null || child.signalCode != null;
    child.once("exit", () => { rootExited = true; });
    child.once("close", () => { rootExited = true; });
    for (;;) {
      // Without a successful tree kill, an exited parent cannot identify its
      // descendants. Retain ownership; never retry a potentially reused PID.
      if (rootExited) await new Promise<never>(() => {});
      const terminated = await new Promise<boolean>((resolve) => {
        const killer = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
          ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", () => resolve(false));
        killer.once("close", (code) => resolve(code === 0));
      });
      if (terminated) return;
      await sleep(250);
    }
  }
  for (;;) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    }
    await sleep(50);
  }
};

type StreamingCommandOptions = {
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  onStdoutLine?(line: string): void | Promise<void>;
  onStderrLine?(line: string): void | Promise<void>;
};

type CapturedCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const createAbortError = (): DOMException => new DOMException(
  "The operation was aborted",
  "AbortError",
);

const attachLineStream = (
  childStream: StreamingChildProcess["stdout"],
  onLine?: (line: string) => void | Promise<void>,
): Promise<void> => {
  if (!onLine) {
    childStream.resume();
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    childStream.setEncoding("utf8");
    let buffer = "";
    let lineChain = Promise.resolve();

    const enqueueLine = (line: string) => {
      lineChain = lineChain.then(() => onLine(line));
    };

    childStream.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r\n|\n|\r/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        enqueueLine(line);
      }
    });
    childStream.on("error", reject);
    childStream.on("end", () => {
      if (buffer.trim()) {
        enqueueLine(buffer);
      }
      lineChain.then(() => resolve(), reject);
    });
  });
};

const waitForChildExit = async (
  child: StreamingChildProcess,
  timeoutMs: number,
): Promise<boolean> => {
  if (child.exitCode !== null) {
    return true;
  }
  const timedOut = await Promise.race([
    once(child, "exit").then(() => false),
    sleep(timeoutMs).then(() => true),
  ]);
  return timedOut === false;
};

const killChild = async (child: StreamingChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  if (process.platform === "win32" && typeof child.pid === "number" && child.pid > 0) {
    const taskkill = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await once(taskkill, "close").catch(() => undefined);
    const exited = await waitForChildExit(child, 800);
    if (exited || child.exitCode !== null) {
      return;
    }
  } else {
    child.kill();
    const exited = await waitForChildExit(child, 500);
    if (exited || child.exitCode !== null) {
      return;
    }
  }

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
};

export const runStreamingCommand = async (
  command: string,
  args: string[],
  options: StreamingCommandOptions = {},
): Promise<number> => {
  if (options.signal?.aborted) {
    throw createAbortError();
  }

  const child = spawn(command, args, {
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const stdoutHandled = attachLineStream(child.stdout, options.onStdoutLine);
  const stderrHandled = attachLineStream(child.stderr, options.onStderrLine);
  let abortHandler: (() => void) | null = null;

  if (options.signal) {
    if (options.signal.aborted) {
      await killChild(child);
    } else {
      abortHandler = () => {
        void killChild(child);
      };
      options.signal.addEventListener(
        "abort",
        abortHandler,
        { once: true },
      );
    }
  }

  try {
    const [code] = await once(child, "close");
    await Promise.all([stdoutHandled, stderrHandled]);
    if (typeof code === "number") {
      return code;
    }
    // Args are deliberately excluded: they may carry proxy credentials or
    // cookie paths and this message is an ordinary error surface.
    throw new Error(`Command exited without status: ${command}`);
  } finally {
    if (abortHandler) {
      options.signal?.removeEventListener("abort", abortHandler);
    }
  }
};

export const runCapturedCommand = async (
  command: string,
  args: string[],
  options: StreamingCommandOptions = {},
): Promise<CapturedCommandResult> => {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const exitCode = await runStreamingCommand(command, args, {
    ...options,
    onStdoutLine: async (line) => {
      stdoutLines.push(line);
      await options.onStdoutLine?.(line);
    },
    onStderrLine: async (line) => {
      stderrLines.push(line);
      await options.onStderrLine?.(line);
    },
  });

  return {
    exitCode,
    stdout: stdoutLines.join("\n"),
    stderr: stderrLines.join("\n"),
  };
};
