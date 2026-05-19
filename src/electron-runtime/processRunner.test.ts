import { describe, expect, it } from "vitest";

import { runStreamingCommand } from "./processRunner";

const waitFor = async (
  predicate: () => boolean,
  attempts = 50,
): Promise<void> => {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe("runStreamingCommand", () => {
  it("rejects immediately when the abort signal is already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(runStreamingCommand(
      "this-command-should-never-spawn",
      [],
      { signal: controller.signal },
    )).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("waits for async stdout line handlers to finish before resolving", async () => {
    const order: string[] = [];
    const releaseHandlerRef: { current: (() => void) | null } = { current: null };

    const handlerGate = new Promise<void>((resolve) => {
      releaseHandlerRef.current = resolve;
    });

    const commandPromise = runStreamingCommand(
      process.execPath,
      ["-e", "console.log('hello from child')"],
      {
        onStdoutLine: async (line) => {
          order.push(`handler-start:${line}`);
          await handlerGate;
          order.push(`handler-end:${line}`);
        },
      },
    ).then(() => {
      order.push("resolved");
    });

    await waitFor(() => order.length > 0);
    expect(order).toEqual(["handler-start:hello from child"]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(order).toEqual(["handler-start:hello from child"]);

    releaseHandlerRef.current?.();
    await commandPromise;

    expect(order).toEqual([
      "handler-start:hello from child",
      "handler-end:hello from child",
      "resolved",
    ]);
  });

  it("treats carriage-return progress updates as stream lines", async () => {
    const lines: string[] = [];

    await runStreamingCommand(
      process.execPath,
      ["-e", "process.stderr.write('time=00:00:01.00\\rtime=00:00:02.00\\r')"],
      {
        onStderrLine: async (line) => {
          lines.push(line);
        },
      },
    );

    expect(lines).toEqual([
      "time=00:00:01.00",
      "time=00:00:02.00",
    ]);
  });
});
