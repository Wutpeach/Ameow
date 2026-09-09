import { describe, expect, it, vi } from "vitest";
import {
  createExpandedPresentationRuntime,
  type ExpandedPresentationFrame,
} from "../presentation/main-window/expandedPresentationRuntime";
import { projectLabOverlayFixture } from "./overlayProjection";
import { createDownloadActiveFixture, createMixedBusyFixture } from "./stateFixtures";

const createHarness = () => {
  const render = vi.fn<(frame: ExpandedPresentationFrame) => void>();
  return createExpandedPresentationRuntime({
    now: () => 0,
    scheduleFrame: () => 1,
    cancelFrame: () => undefined,
    render,
  });
};

describe("Lab fixtures -> production runtime semantics", () => {
  it("reuses the production progress target for Download and Mixed", () => {
    const runtime = createHarness();
    const t = (key: string) => key;
    for (const fixture of [createDownloadActiveFixture(), createMixedBusyFixture()]) {
      runtime.wake({ target: projectLabOverlayFixture(fixture, t).expandedTarget, reducedMotion: false });
      expect(runtime.getProgressLevel()).toBe(0.64);
    }
  });
});
