import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveDotOriginFromClientPoint } from "./dotFieldRecipe";
import { resolvePanelSurfaceClick } from "./dotFieldSurface";

/**
 * MR1 surface-boundary coverage. Node-only Vitest cannot render the Surface,
 * so the classification logic is extracted into the pure
 * `resolvePanelSurfaceClick` predicate and tested directly; the gesture-path
 * wiring facts (context capture before the native callback, non-interactive
 * decorative canvas, eligibility from the existing projection) are pinned by
 * focused source scans, matching the magnetic/pointerField test style.
 */

describe("resolvePanelSurfaceClick", () => {
  const pending = { pointerId: 7, clientX: 120, clientY: 80 };

  it("resolves a left-button pointerup of the pending pointer as a click", () => {
    expect(resolvePanelSurfaceClick(0, 7, pending, false, 1))
      .toEqual({ clientX: 120, clientY: 80 });
  });

  it("excludes non-left buttons", () => {
    expect(resolvePanelSurfaceClick(2, 7, pending, false, 1)).toBeNull();
    expect(resolvePanelSurfaceClick(1, 7, pending, false, 1)).toBeNull();
  });

  it("excludes mismatched pointers (multi-pointer interleaving)", () => {
    expect(resolvePanelSurfaceClick(0, 8, pending, false, 1)).toBeNull();
  });

  it("excludes gestures that became window drags", () => {
    expect(resolvePanelSurfaceClick(0, 7, pending, true, 1)).toBeNull();
  });

  it("excludes pointerups without a pending pointer (no panel pointerdown)", () => {
    expect(resolvePanelSurfaceClick(0, 7, null, false, 1)).toBeNull();
  });

  it("excludes the SECOND click of a non-macOS double-click BEFORE acknowledgement", () => {
    // detail 2 = the second pointerup of the output-folder shortcut gesture.
    expect(resolvePanelSurfaceClick(0, 7, pending, false, 2)).toBeNull();
    // Higher details (triple-click etc.) are never a plain click either.
    expect(resolvePanelSurfaceClick(0, 7, pending, false, 3)).toBeNull();
  });

  it("preserves the FIRST click of a double-click (detail 1 is a real click)", () => {
    expect(resolvePanelSurfaceClick(0, 7, pending, false, 1))
      .toEqual({ clientX: 120, clientY: 80 });
  });
});

describe("resolveDotOriginFromClientPoint (surface ingestion)", () => {
  const rect = { left: 14, top: 14, width: 200, height: 200 };

  it("forms one finite clamped u/v snapshot from a client point", () => {
    expect(resolveDotOriginFromClientPoint(114, 114, rect)).toEqual({ u: 0.5, v: 0.5 });
    expect(resolveDotOriginFromClientPoint(14, 214, rect)).toEqual({ u: 0, v: 1 });
  });

  it("falls back to center without a content rect", () => {
    expect(resolveDotOriginFromClientPoint(100, 100, null)).toEqual({ u: 0.5, v: 0.5 });
  });
});

describe("surface wiring facts (static)", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("captures the context origin synchronously before the native menu callback", () => {
    const source = readFileSync(resolve(here, "MainWindowPresentationSurface.tsx"), "utf8");
    const captureAt = source.indexOf('submitDotFieldIntent("context"');
    const nativeAt = source.indexOf("void onContextMenu(e)");
    expect(captureAt).toBeGreaterThanOrEqual(0);
    expect(nativeAt).toBeGreaterThanOrEqual(0);
    expect(captureAt).toBeLessThan(nativeAt);
  });

  it("renders the Dot Field as a non-interactive decorative layer", () => {
    const source = readFileSync(resolve(here, "DotFieldCanvas.tsx"), "utf8");
    expect(source).toContain('pointerEvents: "none"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("submitIntent");
    // Explicit background layer: the canvas sits at zIndex 0 and is the
    // FIRST child of the content wrapper, so children/drag/compact layers
    // (later DOM order, compact icon zIndex 4) always paint above it.
    expect(source).toContain('zIndex: 0');
  });

  it("revises the backing store on monitor scale changes via the bounded-DPR media query", () => {
    const source = readFileSync(resolve(here, "DotFieldCanvas.tsx"), "utf8");
    expect(source).toContain("resolveDotFieldDprMediaQuery(");
    expect(source).toContain('matchMedia(');
    expect(source).toContain('addEventListener("change"');
    // The re-armed listener follows the REVISED dpr (self-terminating loop).
    expect(source).toContain("dprEpoch");
  });

  it("derives eligibility from the existing visual projection only", () => {
    const source = readFileSync(resolve(here, "MainWindowPresentationSurface.tsx"), "utf8");
    const start = source.indexOf("const dotFieldEligible");
    expect(start).toBeGreaterThanOrEqual(0);
    const block = source.slice(start, start + 400);
    expect(block).toContain('projections.visual.mode === "full"');
    expect(block).toContain("projections.visual.transitionEpoch === null");
  });

  it("does not create a second pointer authority or read the Pointer Field", () => {
    const canvasSource = readFileSync(resolve(here, "DotFieldCanvas.tsx"), "utf8");
    expect(canvasSource).not.toContain("./pointerField");
    const surfaceSource = readFileSync(resolve(here, "MainWindowPresentationSurface.tsx"), "utf8");
    // The surface still writes the ONE Pointer Field authority (unchanged),
    // but the Dot Field host itself must stay independent of it.
    expect(surfaceSource).toContain("updatePointerFieldFromClientPoint(");
  });
});
