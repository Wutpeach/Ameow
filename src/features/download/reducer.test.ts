import { describe, expect, it } from "vitest";
import {
  createInitialDownloadQueueState,
  type DownloadProgress,
  type DownloadTask,
  type DownloadTerminalKind,
  type DownloadTerminalOutcome,
} from "./model";
import {
  reduceDownloadQueue,
  type DownloadAction,
} from "./reducer";

const task = (overrides: Partial<DownloadTask> = {}): DownloadTask => ({
  traceId: "trace-1",
  label: "Video 1",
  status: "active",
  phase: "downloading",
  ...overrides,
});

const progress = (overrides: Partial<DownloadProgress> = {}): DownloadProgress => ({
  traceId: "trace-1",
  percent: 42,
  stage: "downloading",
  speed: "1.2 MB/s",
  eta: "10s",
  ...overrides,
});

const terminal = (
  kind: DownloadTerminalKind,
  overrides: Partial<DownloadTerminalOutcome> = {},
): DownloadTerminalOutcome => ({
  kind,
  traceId: "trace-1",
  errorSummary: null,
  ...overrides,
});

const reduce = (
  state = createInitialDownloadQueueState(),
  ...actions: DownloadAction[]
): ReturnType<typeof reduceDownloadQueue> => actions.reduce(reduceDownloadQueue, state);

describe("reduceDownloadQueue", () => {
  it("accepts queue detail snapshots in snapshot order and prunes removed traces", () => {
    const state = reduce(
      undefined,
      {
        type: "queueDetailReceived",
        tasks: [task({ traceId: "a", label: "A" }), task({ traceId: "b", label: "B" })],
      },
      { type: "progressReceived", progress: progress({ traceId: "b", percent: 10 }) },
      { type: "cancelRequested", traceId: "a" },
      // Reordered snapshot removes "a"; order follows the snapshot, and the
      // removed trace takes its progress and cancel intent with it.
      {
        type: "queueDetailReceived",
        tasks: [task({ traceId: "b", label: "B", status: "pending" })],
      },
    );

    expect(state.order).toEqual(["b"]);
    // Progress for the removed trace is pruned; the surviving trace keeps its own.
    expect(state.progressByTrace).toEqual({ b: expect.objectContaining({ percent: 10 }) });
    expect(state.cancelling).toEqual([]);
  });

  it("keeps the same reference when an empty detail matches an empty queue", () => {
    const state = createInitialDownloadQueueState();
    expect(reduceDownloadQueue(state, { type: "queueDetailReceived", tasks: [] })).toBe(state);
  });

  it("updates progress and never regresses the stage", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "progressReceived", progress: progress({ percent: 30, stage: "downloading" }) },
      // Delayed "preparing" with a real percent cannot move the stage back.
      { type: "progressReceived", progress: progress({ percent: 50, stage: "preparing" }) },
      { type: "progressReceived", progress: progress({ percent: 80, stage: "merging" }) },
    );

    expect(state.progressByTrace["trace-1"]).toMatchObject({ percent: 80, stage: "merging" });
  });

  it("keeps terminal outcomes authoritative and removes the trace from active state", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "progressReceived", progress: progress() },
      { type: "cancelRequested", traceId: "trace-1" },
      { type: "qualitySelectionRequested", traceId: "trace-1", optionId: "o1" },
      { type: "terminalReceived", outcome: terminal("success") },
    );

    expect(state.tasksById).toEqual({});
    expect(state.order).toEqual([]);
    expect(state.progressByTrace).toEqual({});
    expect(state.cancelling).toEqual([]);
    expect(state.qualitySelecting).toEqual({});
    expect(state.terminalTraceIds).toContain("trace-1");
  });

  it("is idempotent for duplicate terminal events", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "terminalReceived", outcome: terminal("failure", { errorSummary: "boom" }) },
    );
    const afterDuplicate = reduceDownloadQueue(
      state,
      { type: "terminalReceived", outcome: terminal("failure", { errorSummary: "boom" }) },
    );

    expect(afterDuplicate).toBe(state);
    expect(state.terminalTraceIds).toEqual(["trace-1"]);
  });

  it("rejects delayed progress after a terminal event (cannot revive the trace)", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "terminalReceived", outcome: terminal("success") },
    );
    const afterLateProgress = reduceDownloadQueue(
      state,
      { type: "progressReceived", progress: progress({ percent: 99 }) },
    );

    expect(afterLateProgress).toBe(state);
    expect(afterLateProgress.progressByTrace).toEqual({});
  });

  it("rejects stale queue detail containing a terminal trace", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "terminalReceived", outcome: terminal("success") },
    );
    const afterStaleDetail = reduceDownloadQueue(state, {
      type: "queueDetailReceived",
      tasks: [task({ traceId: "trace-1", label: "Revived" })],
    });

    expect(afterStaleDetail.order).toEqual([]);
    expect(afterStaleDetail.tasksById).toEqual({});
  });

  it("keeps multiple concurrent traces independent", () => {
    const state = reduce(
      undefined,
      {
        type: "queueDetailReceived",
        tasks: [task({ traceId: "a" }), task({ traceId: "b" })],
      },
      { type: "progressReceived", progress: progress({ traceId: "a", percent: 10 }) },
      { type: "progressReceived", progress: progress({ traceId: "b", percent: 20 }) },
      { type: "terminalReceived", outcome: terminal("success", { traceId: "a" }) },
    );

    expect(state.tasksById.b).toBeDefined();
    expect(state.progressByTrace).toEqual({
      b: expect.objectContaining({ percent: 20 }),
    });
    expect(state.terminalTraceIds).toEqual(["a"]);
  });

  it("clears the terminal guard only through an explicit queue acceptance", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "terminalReceived", outcome: terminal("success") },
    );

    // Ordinary snapshots cannot revive the trace.
    const staleDetail = reduceDownloadQueue(state, {
      type: "queueDetailReceived",
      tasks: [task({ label: "Revived" })],
    });
    expect(staleDetail.order).toEqual([]);

    // A genuinely new accepted generation may.
    const accepted = reduceDownloadQueue(state, { type: "queueAccepted", traceId: "trace-1" });
    expect(accepted.terminalTraceIds).toEqual([]);
  });

  it("lets a typed terminal outcome win over cancel intent", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "cancelRequested", traceId: "trace-1" },
      // Runtime later returns typed success; the cancel intent is dropped.
      { type: "terminalReceived", outcome: terminal("success") },
    );

    expect(state.cancelling).toEqual([]);
    expect(state.tasksById).toEqual({});
  });

  it("ignores a cancel rejection that arrives after the terminal event", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "cancelRequested", traceId: "trace-1" },
      { type: "terminalReceived", outcome: terminal("cancelled") },
    );
    const afterRejection = reduceDownloadQueue(state, {
      type: "cancelRequestRejected",
      traceId: "trace-1",
    });

    expect(afterRejection).toBe(state);
  });

  it("guards per-trace advanced quality selection with an in-flight flag", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "qualitySelectionRequested", traceId: "trace-1", optionId: "o1" },
      // Double-click while in flight: ignored.
      { type: "qualitySelectionRequested", traceId: "trace-1", optionId: "o2" },
    );

    expect(state.qualitySelecting).toEqual({ "trace-1": "o1" });

    // A stale rejection for the superseded option cannot clear the live one.
    const afterStaleRejection = reduceDownloadQueue(state, {
      type: "qualitySelectionRejected",
      traceId: "trace-1",
      optionId: "o2",
    });
    expect(afterStaleRejection.qualitySelecting).toEqual({ "trace-1": "o1" });

    const afterRejection = reduceDownloadQueue(afterStaleRejection, {
      type: "qualitySelectionRejected",
      traceId: "trace-1",
      optionId: "o1",
    });
    expect(afterRejection.qualitySelecting).toEqual({});
  });

  it("keeps per-trace quality selection independent across traces", () => {
    const state = reduce(
      undefined,
      {
        type: "queueDetailReceived",
        tasks: [task({ traceId: "a" }), task({ traceId: "b" })],
      },
      { type: "qualitySelectionRequested", traceId: "a", optionId: "o1" },
    );

    expect(state.qualitySelecting).toEqual({ a: "o1" });
    const afterB = reduceDownloadQueue(state, {
      type: "qualitySelectionRequested",
      traceId: "b",
      optionId: "o9",
    });
    expect(afterB.qualitySelecting).toEqual({ a: "o1", b: "o9" });
  });

  it("clamps queue-count capacity input and treats it as non-membership metadata", () => {
    const state = reduce(
      undefined,
      { type: "queueCountReceived", maxConcurrent: 3 },
      // Invalid values keep the last valid capacity; negatives clamp to 1.
      { type: "queueCountReceived", maxConcurrent: Number.NaN },
      { type: "queueCountReceived", maxConcurrent: -2 },
    );

    expect(state.maxConcurrent).toBe(1);
    // Count alone never creates tasks.
    expect(state.order).toEqual([]);
    expect(reduceDownloadQueue(state, { type: "queueCountReceived", maxConcurrent: 1 })).toBe(state);
  });

  it("ignores cancel requests for terminal or already-cancelling traces", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "cancelRequested", traceId: "trace-1" },
    );
    expect(reduceDownloadQueue(state, { type: "cancelRequested", traceId: "trace-1" })).toBe(state);

    const terminalState = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "terminalReceived", outcome: terminal("success") },
    );
    expect(reduceDownloadQueue(terminalState, { type: "cancelRequested", traceId: "trace-1" }))
      .toBe(terminalState);
  });

  it("clears a reused trace's stale interaction state on explicit acceptance", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "progressReceived", progress: progress({ percent: 90 }) },
      { type: "cancelRequested", traceId: "trace-1" },
      { type: "qualitySelectionRequested", traceId: "trace-1", optionId: "o1" },
      { type: "terminalReceived", outcome: terminal("success") },
    );

    const accepted = reduceDownloadQueue(state, { type: "queueAccepted", traceId: "trace-1" });
    expect(accepted.terminalTraceIds).toEqual([]);
    expect(accepted.cancelling).toEqual([]);
    expect(accepted.qualitySelecting).toEqual({});
    expect(accepted.progressByTrace).toEqual({});
  });

  it("resets the whole lifecycle on reset", () => {
    const state = reduce(
      undefined,
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "progressReceived", progress: progress() },
      { type: "terminalReceived", outcome: terminal("success") },
    );
    const reset = reduceDownloadQueue(state, { type: "reset" });

    expect(reset).toEqual(createInitialDownloadQueueState());
  });
});
