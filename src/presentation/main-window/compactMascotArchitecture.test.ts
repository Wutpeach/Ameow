import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const source = readFileSync(resolve(here, "./CompactMascot.tsx"), "utf8");

describe("CompactMascot architecture boundary", () => {
  it("is one source-specific avatar-core SVG leaf", () => {
    expect(source).toContain('data-compact-mascot="kirby-cat"');
    expect(source).toContain("createCompactMascotBehaviorRuntime");
    expect(source.match(/data-compact-mascot-ear=/g)).toHaveLength(4);
    expect(source).not.toContain("@bible-strong/avatar-react");
    expect(source).not.toContain("CompactCatCharacter");
    expect(source).not.toContain("<canvas");
  });

  it("has no lifecycle, Product, native-window, or IPC authority", () => {
    expect(source).not.toContain('from "./lifecycle"');
    expect(source).not.toContain("desktopCurrentWindow");
    expect(source).not.toContain("dispatch(");
    expect(source).not.toContain("invoke(");
    expect(source).not.toContain("onAnimationEnd");
    expect(source).not.toContain("onExpressionChange");
  });

  it("keeps Reduced Motion free of decorative frame work", () => {
    expect(source).toContain("if (reducedMotion)");
    expect(source).toContain("runtime.renderStatic()");
    expect(source).toContain('pointerField.x.on("change"');
    expect(source).toContain('document.addEventListener("visibilitychange"');
  });

  it("keeps the frozen Lab seam disposable and out of the production surface", () => {
    const surface = readFileSync(resolve(here, "./MainWindowPresentationSurface.tsx"), "utf8");
    expect(source.indexOf("if (previewPose !== undefined)")).toBeLessThan(
      source.indexOf("createCompactMascotBehaviorRuntime({"),
    );
    expect(source).toContain("unsubscribeX();");
    expect(source).toContain("unsubscribeY();");
    expect(surface).not.toContain("previewPose");
  });
});
