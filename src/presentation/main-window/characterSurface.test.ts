import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static composition/wiring facts for the MR2 compact Character, in the same
// source-scan style as `src/architecture/windows-risk-path.test.ts`. These
// assertions pin the Surface boundary so a future edit cannot silently
// re-introduce the legacy image, drop the compact Pointer Field adapter, or
// give the Character its own frame loop.

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");

const read = (relative: string): string =>
  readFileSync(path.join(repoRoot, relative), "utf8");

const SURFACE = "src/presentation/main-window/MainWindowPresentationSurface.tsx";
const CHARACTER = "src/presentation/main-window/CompactCatCharacter.tsx";
const RECIPE = "src/presentation/main-window/characterRecipe.ts";
const BLINK = "src/presentation/main-window/characterBlinkRuntime.ts";

describe("MR2 compact Character composition", () => {
  it("composes the Character at the compact presence boundary and no legacy CatIcon", () => {
    const surface = read(SURFACE);
    expect(surface).toContain("import { CompactCatCharacter }");
    expect(surface).toContain("<CompactCatCharacter");
    expect(surface).not.toContain("CatIcon");
    expect(surface).not.toContain("mascot.svg");
  });

  it("decouples the Character frame from the legacy 38px icon recipe", () => {
    const surface = read(SURFACE);
    expect(surface).toContain("CHARACTER_VISUAL_SIZE");
    expect(surface).not.toMatch(/width: motionRecipe\.icon\.frameSize/);
    expect(surface).not.toMatch(/CatIcon size=\{motionRecipe\.icon\.size\}/);
  });

  it("feeds Windows compact forwarded mouse points through the sole writer BEFORE hotspot evaluation", () => {
    const surface = read(SURFACE);
    const writeIndex = surface.indexOf("updatePointerFieldFromClientPoint(pointerField, clientX, clientY, rect)");
    const hotspotIndex = surface.indexOf("isPointInsideCompactPointerHotspot({");
    expect(writeIndex).toBeGreaterThanOrEqual(0);
    expect(hotspotIndex).toBeGreaterThan(writeIndex);
  });

  it("passes the Pointer Field to the Character read-only with no writer call", () => {
    const surface = read(SURFACE);
    expect(surface).toMatch(/pointerField=\{pointerField\}/);
    const character = read(CHARACTER);
    expect(character).not.toContain("updatePointerFieldFromClientPoint");
    expect(character).not.toContain("resetPointerFieldToCenter");
  });

  it("resets the Pointer Field to center on observable window blur and document hidden", () => {
    const surface = read(SURFACE);
    const effectStart = surface.indexOf("const handleDocumentVisibilityChange");
    expect(effectStart).toBeGreaterThanOrEqual(0);
    const effectEnd = surface.indexOf(
      "}, [panelViewportSize, pointerField]);",
      effectStart,
    );
    expect(effectEnd).toBeGreaterThan(effectStart);
    const effect = surface.slice(effectStart, effectEnd);
    // The observable reset routes through the existing sole writer...
    expect(effect).toContain("resetPointerFieldToCenter(pointerField, panelViewportSize)");
    // ...is Surface-owned (window blur + document hidden), not Character-owned.
    expect(effect).toContain('window.addEventListener("blur", handleWindowBlur)');
    expect(effect).toContain('document.addEventListener("visibilitychange", handleDocumentVisibilityChange)');
    expect(effect).toContain("if (document.hidden)");
  });
});

describe("MR2 Character execution bounds", () => {
  it("owns no requestAnimationFrame and no React per-frame state", () => {
    for (const relative of [CHARACTER, RECIPE, BLINK]) {
      const source = read(relative);
      expect(source, `${relative} must not own a frame loop`).not.toContain("requestAnimationFrame");
      expect(source, `${relative} must not call cancelAnimationFrame`).not.toContain("cancelAnimationFrame");
    }
  });

  it("keeps the blink duty to at most one timer", () => {
    expect(read(BLINK)).toContain("CHARACTER_BLINK_INTERVAL_MS");
    expect(read(BLINK)).toMatch(/pendingTimer === null \? 0 : 1/);
    expect(read(CHARACTER)).toContain("setTimeout");
    expect(read(CHARACTER)).toContain("clearTimeout");
  });

  it("never conditionally swaps the spring source identity (Motion 12 useSpring rebind bug)", () => {
    const character = read(CHARACTER);
    // No ternary/conditional expression may be passed as a useSpring source:
    // Motion 12 captures the source subscription once and never rebinds it.
    expect(character).not.toMatch(/useSpring\([^)]*\?[^)]*\)/);
    // Exactly three springs, each bound permanently to one stable MotionValue.
    expect(character.match(/useSpring\(/g) ?? []).toHaveLength(3);
    expect(character).toMatch(/useSpring\(springSourceX,/);
    expect(character).toMatch(/useSpring\(springSourceY,/);
    expect(character).toMatch(/useSpring\(targetBody,/);
  });

  it("gates the stable spring sources with a render-time reduced flag (synchronous, no effect lag)", () => {
    const character = read(CHARACTER);
    // The gate observes the current reducedMotion on the SAME render that
    // computes the targets — a ref written during render, read only by the
    // gate transforms — never an effect-synced MotionValue one render later
    // (which would let the frozen source receive one reduced target frame).
    expect(character).toMatch(/const reducedMotionRef = useRef\(reducedMotion\);/);
    expect(character).toContain("reducedMotionRef.current = reducedMotion");
    expect(character).toMatch(/useTransform\(\s*targetX,/);
    expect(character).toMatch(/useTransform\(\s*targetY,/);
    // Each gate holds the last normal target in a ref and routes through the
    // pure gate helper (runtime-tested in characterRecipe.test.ts), so a
    // false -> true -> false toggle can never leave a spring permanently
    // frozen on a stale source.
    expect(character).toContain("lastNormalXRef");
    expect(character).toContain("lastNormalYRef");
    expect(character).toContain("resolveGatedSpringSource(");
    // No effect-synced flag MotionValue remains.
    expect(character).not.toContain("reducedMotionValue");
  });

  it("settles all three hidden springs via the jump API on entering Reduced Motion", () => {
    const character = read(CHARACTER);
    const jumpStart = character.indexOf("springX.jump(");
    expect(jumpStart).toBeGreaterThan(character.indexOf("if (!reducedMotion)"));
    expect(character.match(/springX\.jump\(targetX\.get\(\)\)/g) ?? []).toHaveLength(1);
    expect(character.match(/springY\.jump\(targetY\.get\(\)\)/g) ?? []).toHaveLength(1);
    expect(character.match(/springBody\.jump\(targetBody\.get\(\)\)/g) ?? []).toHaveLength(1);
  });

  it("restores the blink scale to full-open on every interruption path", () => {
    const character = read(CHARACTER);
    const restoreStart = character.indexOf("const restoreBlinkOpen");
    expect(restoreStart).toBeGreaterThanOrEqual(0);
    const restoreBody = character.slice(
      restoreStart,
      character.indexOf("};", restoreStart),
    );
    // The restore helper stops the keyframe AND resets the scale to 1.
    expect(restoreBody).toContain("blinkAnimationRef.current?.stop()");
    expect(restoreBody).toContain("blinkScaleY.set(1)");
    // Every interruption path (visibility sleep + unmount/reduced-motion
    // cleanup) routes through the restore helper.
    expect(character.match(/restoreBlinkOpen\(\)/g) ?? []).toHaveLength(2);
    // No other code path may stop the animation without restoring the scale.
    expect(character.match(/blinkAnimationRef\.current\?\.stop\(\)/g) ?? []).toHaveLength(2);
  });

  it("exposes no completion callback to lifecycle or Product code", () => {
    const character = read(CHARACTER);
    expect(character).not.toMatch(/onComplete|onAnimationComplete|visualTransitionCompleted/);
    expect(character).not.toContain("dispatch");
  });

  it("keeps the Character local to the presentation surface boundary", () => {
    expect(read(SURFACE)).toContain("compact-icon-settle-");
  });
});
