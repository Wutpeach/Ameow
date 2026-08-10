import { describe, expect, it } from "vitest";
import {
  createInitialDownloadQueueState,
  type DownloadTask,
} from "./model";
import { reduceDownloadQueue, type DownloadAction } from "./reducer";
import {
  selectActiveDownloadQueueTasks,
  selectAdvancedQualitySelectionTask,
  selectDownloadQueueRows,
  selectIsTaskCancelling,
  selectIsTaskQualitySelecting,
  selectPrimaryDownloadProgress,
  selectPrimaryDownloadStage,
  selectPrimaryDownloadTask,
  selectRemainingDownloadCount,
  selectTaskProgressPercent,
  selectVisibleTaskCount,
} from "./selectors";

const task = (overrides: Partial<DownloadTask> = {}): DownloadTask => ({
  traceId: "trace-1",
  label: "Video 1",
  status: "active",
  phase: "downloading",
  ...overrides,
});

const stateWith = (...actions: DownloadAction[]): ReturnType<typeof reduceDownloadQueue> =>
  actions.reduce(reduceDownloadQueue, createInitialDownloadQueueState());

describe("Download selectors", () => {
  it("derives the visible total from one reconciled task model", () => {
    // Count/detail/progress disagreement: only the task model counts.
    const state = stateWith(
      { type: "queueDetailReceived", tasks: [task({ traceId: "a" }), task({ traceId: "b" })] },
      { type: "progressReceived", progress: { traceId: "c", percent: 50, stage: "downloading", speed: "", eta: "" } },
    );
    expect(selectVisibleTaskCount(state)).toBe(2);
    expect(selectDownloadQueueRows(state).map((t) => t.traceId)).toEqual(["a", "b"]);
  });

  it("selects the first active task as primary, skipping pending tasks", () => {
    const state = stateWith({
      type: "queueDetailReceived",
      tasks: [
        task({ traceId: "pending-1", status: "pending" }),
        task({ traceId: "active-1" }),
        task({ traceId: "active-2" }),
      ],
    });

    expect(selectActiveDownloadQueueTasks(state).map((t) => t.traceId))
      .toEqual(["active-1", "active-2"]);
    expect(selectPrimaryDownloadTask(state)?.traceId).toBe("active-1");
  });

  it("presents probing/selecting-quality phases as indeterminate progress", () => {
    const probing = stateWith({
      type: "queueDetailReceived",
      tasks: [task({ phase: "probing_quality" })],
    });
    expect(selectPrimaryDownloadProgress(probing)).toMatchObject({
      traceId: "trace-1",
      percent: -1,
      stage: "preparing",
    });
    expect(selectPrimaryDownloadStage(probing)).toBe("preparing");

    const downloading = stateWith(
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "progressReceived", progress: { traceId: "trace-1", percent: 66, stage: "downloading", speed: "x", eta: "y" } },
    );
    expect(selectPrimaryDownloadProgress(downloading)).toMatchObject({ percent: 66 });
    expect(selectPrimaryDownloadStage(downloading)).toBe("downloading");

    expect(selectPrimaryDownloadProgress(createInitialDownloadQueueState())).toBeNull();
  });

  it("derives remaining count from the model and primary ownership", () => {
    const state = stateWith({
      type: "queueDetailReceived",
      tasks: [task({ traceId: "a" }), task({ traceId: "b" })],
    });
    expect(selectRemainingDownloadCount(state, true)).toBe(1);
    expect(selectRemainingDownloadCount(state, false)).toBe(2);
    expect(selectRemainingDownloadCount(createInitialDownloadQueueState(), false)).toBe(0);
  });

  it("finds the trace-specific advanced-quality selection task", () => {
    const state = stateWith({
      type: "queueDetailReceived",
      tasks: [
        task({ traceId: "a" }),
        task({
          traceId: "b",
          phase: "selecting_quality",
          qualityOptions: [{ id: "o1", label: "1080p" }],
        }),
      ],
    });
    expect(selectAdvancedQualitySelectionTask(state)?.traceId).toBe("b");
  });

  it("excludes terminal traces from active selectors", () => {
    const state = stateWith(
      {
        type: "queueDetailReceived",
        tasks: [task({ traceId: "a" }), task({ traceId: "b" })],
      },
      { type: "terminalReceived", outcome: { kind: "failure", traceId: "a", errorSummary: "boom" } },
    );

    expect(selectVisibleTaskCount(state)).toBe(1);
    expect(selectDownloadQueueRows(state).map((t) => t.traceId)).toEqual(["b"]);
    expect(selectPrimaryDownloadTask(state)?.traceId).toBe("b");
  });

  it("reports per-trace cancel and quality-selection in-flight state", () => {
    const state = stateWith(
      { type: "queueDetailReceived", tasks: [task()] },
      { type: "cancelRequested", traceId: "trace-1" },
      { type: "qualitySelectionRequested", traceId: "trace-1", optionId: "o1" },
    );

    expect(selectIsTaskCancelling(state, "trace-1")).toBe(true);
    expect(selectIsTaskQualitySelecting(state, "trace-1")).toBe(true);
    expect(selectIsTaskCancelling(state, "other")).toBe(false);
    expect(selectIsTaskQualitySelecting(state, "other")).toBe(false);
  });

  it("maps queue-row progress percents per phase", () => {
    const state = stateWith({
      type: "queueDetailReceived",
      tasks: [
        task({ traceId: "selecting", phase: "selecting_quality" }),
        task({ traceId: "probing", phase: "probing_quality" }),
        task({ traceId: "pending", status: "pending" }),
        task({ traceId: "active" }),
        task({ traceId: "no-progress" }),
      ],
    });

    expect(selectTaskProgressPercent(state, task({ traceId: "selecting", phase: "selecting_quality" }))).toBe(100);
    expect(selectTaskProgressPercent(state, task({ traceId: "probing", phase: "probing_quality" }))).toBe(18);
    expect(selectTaskProgressPercent(state, task({ traceId: "pending", status: "pending" }))).toBe(8);
    expect(selectTaskProgressPercent(state, task({ traceId: "active" }))).toBe(18);
    expect(selectTaskProgressPercent(state, task({ traceId: "no-progress" }))).toBe(18);
  });
});
