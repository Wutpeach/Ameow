import { describe, expect, it } from "vitest";

import type { RuntimeDependencyStatusSnapshot } from "../types/runtimeDependencies";
import { createRuntimeDependencyResolver } from "./runtimeDependencyGate";

const readyEntry = {
  state: "ready" as const,
  source: "bundled" as const,
  path: "D:/runtime/tool",
  error: null,
};

const missingEntry = {
  state: "missing" as const,
  source: null,
  path: null,
  error: "Missing runtime",
};

const createStatus = (
  overrides: Partial<RuntimeDependencyStatusSnapshot> = {},
): RuntimeDependencyStatusSnapshot => ({
  python: readyEntry,
  ytDlp: readyEntry,
  galleryDl: readyEntry,
  douyinDl: readyEntry,
  ffmpeg: { ...readyEntry, source: "managed" as const },
  deno: { ...readyEntry, source: "managed" as const },
  ...overrides,
});

describe("createRuntimeDependencyResolver", () => {
  it("treats managed gallery-dl as a missing managed component instead of a fatal bundled failure", () => {
    const resolver = createRuntimeDependencyResolver(
      createStatus({
        galleryDl: {
          ...missingEntry,
          expectedSource: "managed",
          error: "Missing managed gallery-dl runtime",
        },
      }),
      () => createStatus(),
    );

    expect(resolver.getGateState()).toMatchObject({
      phase: "idle",
      missingComponents: ["galleryDl"],
      lastError: null,
    });
  });

  it("treats managed yt-dlp as a missing managed component instead of a fatal bundled failure", () => {
    const resolver = createRuntimeDependencyResolver(
      createStatus({
        ytDlp: {
          ...missingEntry,
          expectedSource: "managed",
          error: "Missing managed yt-dlp runtime",
        },
      }),
      () => createStatus(),
    );

    expect(resolver.getGateState()).toMatchObject({
      phase: "idle",
      missingComponents: ["ytDlp"],
      lastError: null,
    });
  });

  it("treats managed douyin-dl as a missing managed component instead of a fatal bundled failure", () => {
    const resolver = createRuntimeDependencyResolver(
      createStatus({
        douyinDl: {
          ...missingEntry,
          expectedSource: "managed",
          error: "Missing managed douyin-dl runtime",
        },
      }),
      () => createStatus(),
    );

    expect(resolver.getGateState()).toMatchObject({
      phase: "idle",
      missingComponents: ["douyinDl"],
      lastError: null,
    });
  });

  it("reports ready when bundled runtimes are present and managed runtimes are healthy", () => {
    const resolver = createRuntimeDependencyResolver(
      createStatus(),
      () => createStatus(),
    );

    expect(resolver.getGateState()).toMatchObject({
      phase: "ready",
      missingComponents: [],
      lastError: null,
    });
  });

  it("fails fast when bundled python is missing", () => {
    const resolver = createRuntimeDependencyResolver(
      createStatus({
        python: {
          ...missingEntry,
          expectedSource: "bundled",
          error: "Missing bundled Python runtime",
        },
      }),
      () => createStatus(),
    );

    expect(resolver.getGateState()).toMatchObject({
      phase: "failed",
      lastError: "Missing bundled Python runtime",
    });
  });
});
