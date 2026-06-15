import { describe, expect, it } from "vitest";

import {
  createCenterOverlayState,
  isCenterOverlayLockActive,
  isCenterOverlayTaskOutcomeVisible,
  reduceCenterOverlayState,
  selectCenterOverlayVisual,
} from "./centerOverlayState";

describe("centerOverlayState", () => {
  it("keeps progress as the selected visual over stale transient outcomes", () => {
    const state = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });

    expect(selectCenterOverlayVisual({
      primaryTask: { kind: "download", traceId: "next-download" },
      centerOverlayState: state,
      visualIsMinimized: false,
    })).toEqual({
      kind: "task-progress",
      key: "progress:download:next-download",
    });
  });

  it("uses request ids to ignore stale task outcome timer completions", () => {
    const loading = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "beginTaskOutcomeLoading",
      status: "success",
      durationMs: 1500,
    });
    const visible = reduceCenterOverlayState(loading, {
      type: "showTaskOutcome",
      requestId: loading.requestId,
    });
    const interrupted = reduceCenterOverlayState(visible, {
      type: "beginTaskProcessing",
      source: "image",
    });

    expect(reduceCenterOverlayState(interrupted, {
      type: "finishTaskOutcome",
      requestId: loading.requestId,
    })).toBe(interrupted);
  });

  it("uses request ids to ignore stale folder timers", () => {
    const first = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });
    const second = reduceCenterOverlayState(first, {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });

    expect(reduceCenterOverlayState(second, {
      type: "finishFolderOutcome",
      requestId: first.requestId,
    })).toBe(second);
  });

  it("locks the center overlay through processing, loading, visible outcome, and folder states", () => {
    const idle = createCenterOverlayState();
    const processing = reduceCenterOverlayState(idle, {
      type: "beginTaskProcessing",
      source: "image",
    });
    const loading = reduceCenterOverlayState(processing, {
      type: "beginTaskOutcomeLoading",
      status: "success",
      durationMs: 1500,
    });
    const visible = reduceCenterOverlayState(loading, {
      type: "showTaskOutcome",
      requestId: loading.requestId,
    });
    const folder = reduceCenterOverlayState(idle, {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });

    expect(isCenterOverlayLockActive(idle)).toBe(false);
    expect(isCenterOverlayLockActive(processing)).toBe(true);
    expect(isCenterOverlayLockActive(loading)).toBe(true);
    expect(isCenterOverlayLockActive(visible)).toBe(true);
    expect(isCenterOverlayLockActive(folder)).toBe(true);
  });

  it("reports only the visible task outcome phase as task outcome visible", () => {
    const loading = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "beginTaskOutcomeLoading",
      status: "success",
      durationMs: 1500,
    });
    const visible = reduceCenterOverlayState(loading, {
      type: "showTaskOutcome",
      requestId: loading.requestId,
    });

    expect(isCenterOverlayTaskOutcomeVisible(loading)).toBe(false);
    expect(isCenterOverlayTaskOutcomeVisible(visible)).toBe(true);
  });

  it("falls back to minimized only when no progress or transient outcome owns the center", () => {
    const state = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });

    expect(selectCenterOverlayVisual({
      primaryTask: null,
      centerOverlayState: state,
      visualIsMinimized: true,
    }).kind).toBe("folder-outcome");

    expect(selectCenterOverlayVisual({
      primaryTask: null,
      centerOverlayState: createCenterOverlayState(),
      visualIsMinimized: true,
    })).toEqual({
      kind: "minimized",
      key: "minimized",
    });
  });
});
