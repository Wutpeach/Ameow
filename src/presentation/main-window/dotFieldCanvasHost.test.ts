import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DotFieldTerminalTarget } from "./dotFieldRecipe";

/**
 * MR5 focused host-boundary regression for the Dot Field terminal lane.
 *
 * Node-only Vitest cannot render the React `DotFieldCanvas` host, so this
 * suite pins the one piece of React behavior that decides whether a projected
 * terminal replacement reaches the already-capable local runtime: the value
 * signature that gates the baseline effect (`DotFieldCanvas.tsx`). The actual
 * shipped expression is extracted from source and evaluated directly, so a
 * future edit that drops `status` from the signature fails these tests even
 * though the runtime itself (`dotFieldRuntime.ts`) already handles lane
 * replacement (covered by `dotFieldRuntime.test.ts`).
 */

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");

const read = (relative: string): string =>
  readFileSync(path.join(repoRoot, relative), "utf8");

const CANVAS = "src/presentation/main-window/DotFieldCanvas.tsx";

const extractTerminalSignature = (source: string): ((terminal: DotFieldTerminalTarget) => string) => {
  const marker = "const terminalSignature = ";
  const start = source.indexOf(marker);
  expect(start, "DotFieldCanvas must keep the terminalSignature value signature").toBeGreaterThanOrEqual(0);
  const end = source.indexOf(";", start);
  const expression = source.slice(start + marker.length, end).trim();
  // Static test-time evaluation of the shipped signature expression.
  return new Function("terminal", `return (${expression});`) as (terminal: DotFieldTerminalTarget) => string;
};

const terminal = (status: "success" | "failure" | "cancelled"): DotFieldTerminalTarget => ({
  kind: "terminal",
  status,
});

describe("DotFieldCanvas terminal value boundary", () => {
  it("delivers success -> failure -> cancelled as distinct signatures (crosses the effect boundary)", () => {
    const signature = extractTerminalSignature(read(CANVAS));
    const none = signature({ kind: "none" });
    const success = signature(terminal("success"));
    const failure = signature(terminal("failure"));
    const cancelled = signature(terminal("cancelled"));
    // A status replacement changes the signature, so the baseline effect
    // re-runs and setBaseline re-delivers the new typed target to the runtime.
    expect(success).not.toBe(none);
    expect(failure).not.toBe(success);
    expect(cancelled).not.toBe(failure);
    expect(cancelled).not.toBe(none);
  });

  it("keeps equal-value identity churn a no-op (same signature, effect skipped, no restart)", () => {
    const signature = extractTerminalSignature(read(CANVAS));
    // Two separately-constructed equal targets must produce the same
    // signature: render identity churn cannot re-deliver and restart the lane.
    expect(signature(terminal("success"))).toBe(signature(terminal("success")));
    expect(signature({ kind: "none" })).toBe(signature({ kind: "none" }));
    // And the no-op does not hide a real replacement: none -> success differs.
    expect(signature(terminal("success"))).not.toBe(signature({ kind: "none" }));
  });

  it("keys the signature on the discriminator (status), not the constant kind", () => {
    const source = read(CANVAS);
    const marker = "const terminalSignature = ";
    const start = source.indexOf(marker);
    const end = source.indexOf(";", start);
    const expression = source.slice(start + marker.length, end);
    // The kind field of a non-none target is literally "terminal"; a signature
    // built from it can never distinguish success/failure/cancelled.
    expect(expression).toContain("terminal.status");
    expect(expression).not.toContain("terminal.kind}");
  });

  it("gates the baseline effect on the terminal signature", () => {
    const source = read(CANVAS);
    const depsStart = source.indexOf(
      "}, [size, eligible, reducedMotion, dormantColor, ackColor, dprEpoch, progressSignature, terminalSignature]);",
    );
    expect(depsStart).toBeGreaterThanOrEqual(0);
  });
});
