import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async (original) => ({ ...await original<typeof import("node:child_process")>(), spawn: mocks.spawn }));
vi.mock("node:timers/promises", () => ({ setTimeout: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)) }));
import { runCapturedUtilityCommand, runUtilityCommand, managedPythonCommandOptions } from "./managedRuntimeBootstrap.mjs";

const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
const handle = (pid?: number) => Object.assign(new EventEmitter(), {
  pid, stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => false),
});
afterEach(() => { vi.useRealTimers(); Object.defineProperty(process, "platform", platformDescriptor); vi.restoreAllMocks(); mocks.spawn.mockReset(); });

describe("managed process settlement", () => {
  it("removes ambient Python and pip injection for every candidate child", () => {
    vi.stubEnv("PYTHONPATH", "sensitive-user-site");
    vi.stubEnv("PIP_INDEX_URL", "https://user:secret@example.test");
    vi.stubEnv("VIRTUAL_ENV", "other-env");
    try {
      const options = managedPythonCommandOptions(process.platform, 100);
      expect(options.timeoutMs).toBe(100);
      expect(options.env).not.toHaveProperty("PYTHONPATH");
      expect(options.env).not.toHaveProperty("PIP_INDEX_URL");
      expect(options.env).not.toHaveProperty("VIRTUAL_ENV");
      expect(options.env).toMatchObject({ PYTHONNOUSERSITE: "1", PYTHONSAFEPATH: "1", PYTHONDONTWRITEBYTECODE: "1", PIP_NO_INDEX: "1" });
    } finally { vi.unstubAllEnvs(); }
  });

  it("terminates an actual PID-present child and its detached-stdio descendant", async () => {
    const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    mocks.spawn.mockImplementation(actual.spawn);
    const root = await mkdtemp(join(tmpdir(), "ameow-owned-process-"));
    const pidFile = join(root, "pids.json");
    const script = `const {spawn}=require("node:child_process"); const fs=require("node:fs"); const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore",windowsHide:true}); fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,c.pid])); setInterval(()=>{},1000);`;
    try {
      await expect(runUtilityCommand(process.execPath, ["-e", script, pidFile], { timeoutMs: 1000 })).rejects.toThrow("timed out");
      const pids = JSON.parse(await readFile(pidFile, "utf8"));
      expect(pids).toHaveLength(2);
      for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 15_000);

  it("bounds low-level utility callers that do not supply a timeout", async () => {
    vi.useFakeTimers();
    const child = handle();
    mocks.spawn.mockReturnValue(child);
    const operation = runCapturedUtilityCommand("app-owned", []).catch((error) => error);
    await vi.advanceTimersByTimeAsync(60_000);
    child.emit("close", 0);
    expect(await operation).toMatchObject({ message: "Utility command timed out" });
  });

  it.each([runUtilityCommand, runCapturedUtilityCommand])("retains ownership until a no-PID child closes, and fails a late exit zero", async (run) => {
    vi.useFakeTimers();
    const child = handle();
    mocks.spawn.mockReturnValue(child);
    let settled = false;
    const operation = run("app-owned", [], { timeoutMs: 10 }).catch((error) => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);
    child.emit("close", 0);
    expect(await operation).toMatchObject({ message: "Utility command timed out" });
  });

  it.skipIf(process.platform !== "win32")("uses native taskkill and retains a PID-present child across killer error and descendant settlement", async () => {
    vi.useFakeTimers();
    const child = handle(12345);
    const failedKiller = handle();
    const killer = handle();
    mocks.spawn.mockReturnValueOnce(child).mockReturnValueOnce(failedKiller).mockReturnValue(killer);
    let settled = false;
    const operation = runCapturedUtilityCommand("app-owned", [], { timeoutMs: 10 }).catch((error) => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(10);
    expect(mocks.spawn.mock.calls[1][0]).toMatch(/System32[\\/]taskkill\.exe$/i);
    expect(mocks.spawn.mock.calls[1][1]).toEqual(["/PID", "12345", "/T", "/F"]);
    expect(child.kill).not.toHaveBeenCalled();
    failedKiller.emit("error", new Error("denied"));
    await vi.advanceTimersByTimeAsync(250);
    expect(settled).toBe(false);
    child.emit("close", 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false); // root exit is not descendant settlement
    killer.emit("close", 0);
    expect(await operation).toMatchObject({ message: "Utility command timed out" });
  });

  it.skipIf(process.platform !== "win32")("never retries an exited root PID after failed tree termination", async () => {
    vi.useFakeTimers();
    const child = handle(12345);
    const killer = handle();
    mocks.spawn.mockReturnValueOnce(child).mockReturnValue(killer);
    let settled = false;
    void runUtilityCommand("app-owned", [], { timeoutMs: 10 }).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(10);
    killer.emit("error", new Error("denied"));
    child.emit("close", 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toBe(false);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it("kills the owned POSIX group and waits until descendants are absent (simulated OS)", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.useFakeTimers();
    const child = handle(12345);
    mocks.spawn.mockReturnValue(child);
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    let settled = false;
    const operation = runUtilityCommand("app-owned", [], { timeoutMs: 10 }).catch((error) => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(10);
    expect(mocks.spawn.mock.calls[0][2].detached).toBe(true);
    expect(kill).toHaveBeenCalledWith(-12345, "SIGKILL");
    child.emit("close", 0);
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);
    kill.mockImplementation(() => { throw Object.assign(new Error("absent"), { code: "ESRCH" }); });
    await vi.advanceTimersByTimeAsync(50);
    expect(await operation).toMatchObject({ message: "Utility command timed out" });
  });
});
