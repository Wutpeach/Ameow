import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: spawnMock,
  };
});

import { runStreamingCommand } from "./processRunner.js";

const createFakeChild = (): EventEmitter & {
  stdout: EventEmitter & { resume: ReturnType<typeof vi.fn>; setEncoding: ReturnType<typeof vi.fn> };
  stderr: EventEmitter & { resume: ReturnType<typeof vi.fn>; setEncoding: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
  pid: number;
  exitCode: number | null;
} => {
  const stdout = new EventEmitter() as EventEmitter & {
    resume: ReturnType<typeof vi.fn>;
    setEncoding: ReturnType<typeof vi.fn>;
  };
  const stderr = new EventEmitter() as EventEmitter & {
    resume: ReturnType<typeof vi.fn>;
    setEncoding: ReturnType<typeof vi.fn>;
  };
  stdout.resume = vi.fn();
  stdout.setEncoding = vi.fn();
  stderr.resume = vi.fn();
  stderr.setEncoding = vi.fn();
  const child = new EventEmitter() as EventEmitter & {
    stdout: typeof stdout;
    stderr: typeof stderr;
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
    pid: number;
    exitCode: number | null;
  };
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = vi.fn(() => true);
  child.killed = false;
  child.pid = 4242;
  child.exitCode = null;
  return child;
};

describe("runStreamingCommand credential safety", () => {
  it("never includes command args in the exited-without-status error", async () => {
    const child = createFakeChild();
    spawnMock.mockReturnValue(child);

    const promise = runStreamingCommand(
      "yt-dlp",
      ["--proxy", "http://user:supersecret@127.0.0.1:7897", "--cookies", "C:/temp/cookies.txt"],
    );
    setImmediate(() => {
      child.emit("close", null, "SIGKILL");
    });

    const error = await promise.catch((caught: unknown) => caught);
    expect((error as Error).message).toBe("Command exited without status: yt-dlp");
    expect((error as Error).message).not.toContain("supersecret");
    expect((error as Error).message).not.toContain("--proxy");
    expect((error as Error).message).not.toContain("cookies.txt");
  });
});
