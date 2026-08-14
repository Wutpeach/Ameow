import { describe, expect, it, vi } from "vitest";
import {
  createExpandedPresentationRuntime,
  type ExpandedPresentationFrame,
  type ExpandedPresentationInputs,
} from "./expandedPresentationRuntime";

const idle = (reducedMotion = false): ExpandedPresentationInputs => ({
  progress: { kind: "idle" },
  terminal: { kind: "none" },
  reducedMotion,
});

const createHarness = () => {
  let now = 0;
  let nextHandle = 1;
  const callbacks = new Map<number, (time: number) => void>();
  const frames: ExpandedPresentationFrame[] = [];
  const render = vi.fn((frame: ExpandedPresentationFrame) => frames.push(frame));
  const runtime = createExpandedPresentationRuntime({
    now: () => now,
    scheduleFrame: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => callbacks.delete(handle),
    render,
  });
  return {
    runtime,
    frames,
    render,
    pending: () => callbacks.size,
    step: (delta = 16) => {
      now += delta;
      const current = [...callbacks.values()];
      callbacks.clear();
      current.forEach((callback) => callback(now));
    },
    capturePending: () => [...callbacks.values()],
  };
};

describe("Expanded Presentation runtime", () => {
  it("draws idle once on wake and leaves no frame work", () => {
    const harness = createHarness();
    harness.runtime.wake(idle());
    expect(harness.frames).toHaveLength(1);
    expect(harness.pending()).toBe(0);
  });

  it("converges upward toward the latest same-trace target with one frame", () => {
    const harness = createHarness();
    harness.runtime.wake({
      ...idle(),
      progress: { kind: "determinate", traceId: "a", target: 0.2 },
    });
    harness.runtime.setInputs({
      ...idle(),
      progress: { kind: "determinate", traceId: "a", target: 0.6 },
    });
    harness.runtime.setInputs({
      ...idle(),
      progress: { kind: "determinate", traceId: "a", target: 0.8 },
    });
    expect(harness.runtime.getProgressLevel()).toBe(0.2);
    expect(harness.runtime.getProgressTarget()).toEqual({
      kind: "determinate",
      traceId: "a",
      target: 0.8,
    });
    expect(harness.pending()).toBe(1);
    harness.step(50);
    expect(harness.runtime.getProgressLevel()).toBeGreaterThan(0.2);
    expect(harness.pending()).toBe(1);
  });

  it("applies authoritative downward revisions immediately", () => {
    const harness = createHarness();
    harness.runtime.wake({
      ...idle(),
      progress: { kind: "determinate", traceId: "a", target: 0.8 },
    });
    harness.runtime.setInputs({
      ...idle(),
      progress: { kind: "determinate", traceId: "a", target: 0.35 },
    });
    expect(harness.runtime.getProgressLevel()).toBe(0.35);
    expect(harness.pending()).toBe(0);
  });

  it("rebases a replacement trace instead of inheriting prior progress", () => {
    const harness = createHarness();
    harness.runtime.wake({
      ...idle(),
      progress: { kind: "determinate", traceId: "old", target: 0.9 },
    });
    harness.runtime.setInputs({
      ...idle(),
      progress: { kind: "determinate", traceId: "new", target: 0.12 },
    });
    expect(harness.runtime.getProgressLevel()).toBe(0.12);
    expect(harness.pending()).toBe(0);
  });

  it("keeps normal indeterminate evolution bounded and stops it for Reduced Motion", () => {
    const harness = createHarness();
    harness.runtime.wake({
      ...idle(),
      progress: { kind: "indeterminate", traceId: "a" },
    });
    expect(harness.pending()).toBe(1);
    harness.step();
    expect(harness.pending()).toBe(1);
    harness.runtime.setInputs({
      ...idle(true),
      progress: { kind: "indeterminate", traceId: "a" },
    });
    expect(harness.pending()).toBe(0);
    const lastFrame = harness.frames[harness.frames.length - 1];
    expect(lastFrame?.progress.kind).toBe("indeterminate");
    expect(lastFrame?.reducedMotion).toBe(true);
  });

  it.each(["success", "failure", "cancelled"] as const)(
    "renders terminal %s without taking retention ownership",
    (status) => {
      const harness = createHarness();
      harness.runtime.wake({
        ...idle(),
        terminal: { kind: "terminal", status },
      });
      expect(harness.runtime.getTerminalTarget()).toEqual({ kind: "terminal", status });
      expect(harness.pending()).toBe(0);
      harness.runtime.setInputs(idle());
      expect(harness.runtime.getTerminalTarget()).toEqual({ kind: "none" });
      expect(harness.pending()).toBe(0);
    },
  );

  it("gives current progress priority over a terminal target", () => {
    const harness = createHarness();
    harness.runtime.wake({
      ...idle(),
      progress: { kind: "indeterminate", traceId: "current" },
      terminal: { kind: "terminal", status: "success" },
    });
    expect(harness.runtime.getTerminalTarget()).toEqual({ kind: "none" });
    expect(harness.runtime.getProgressTarget().kind).toBe("indeterminate");
  });

  it("reconstructs from current inputs after sleep and ignores stale generations", () => {
    const harness = createHarness();
    harness.runtime.wake({
      ...idle(),
      progress: { kind: "indeterminate", traceId: "old" },
    });
    const [staleFrame] = harness.capturePending();
    harness.runtime.sleep();
    harness.runtime.wake({
      ...idle(),
      progress: { kind: "determinate", traceId: "new", target: 0.42 },
    });
    const renderCount = harness.render.mock.calls.length;
    staleFrame?.(100);
    expect(harness.render).toHaveBeenCalledTimes(renderCount);
    expect(harness.runtime.getProgressLevel()).toBe(0.42);
    expect(harness.pending()).toBe(0);
  });

  it("dispose is permanent and leaves zero work", () => {
    const harness = createHarness();
    harness.runtime.wake({
      ...idle(),
      progress: { kind: "indeterminate", traceId: "a" },
    });
    harness.runtime.dispose();
    harness.runtime.wake(idle());
    harness.runtime.setInputs(idle());
    expect(harness.runtime.getState()).toBe("disposed");
    expect(harness.pending()).toBe(0);
  });

  it("fails decorative rendering closed without propagating authority", () => {
    const runtime = createExpandedPresentationRuntime({
      now: () => 0,
      scheduleFrame: () => 1,
      cancelFrame: vi.fn(),
      render: () => {
        throw new Error("context unavailable");
      },
    });
    expect(() => runtime.wake(idle())).not.toThrow();
    expect(runtime.getState()).toBe("sleeping");
    expect(runtime.getPendingFrameCount()).toBe(0);
  });
});
