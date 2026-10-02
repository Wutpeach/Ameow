import { describe, expect, it, vi } from "vitest";
import {
  LAB_COMPACT_ATTENTION_CENTER,
  resetLabCompactPointerToCenter,
  resolveLabCompactPointerPoint,
  updateLabCompactPointerFromClientPoint,
  type LabCompactPointerField,
} from "./compactPointerField";

const STAGE_RECT = { left: 10, top: 10, width: 80, height: 80 };

const createFakeField = () => ({
  x: { set: vi.fn() },
  y: { set: vi.fn() },
}) as unknown as LabCompactPointerField;

describe("Lab Compact pointer field", () => {
  it("converts client coordinates into 56x56 logical-frame points", () => {
    expect(resolveLabCompactPointerPoint(50, 50, STAGE_RECT)).toEqual({ x: 28, y: 28 });
    expect(resolveLabCompactPointerPoint(90, 90, {
      left: 10,
      top: 10,
      width: 160,
      height: 160,
    })).toEqual({ x: 28, y: 28 });
  });

  it("clamps points into the logical frame", () => {
    expect(resolveLabCompactPointerPoint(-50, 400, STAGE_RECT)).toEqual({ x: 0, y: 56 });
    expect(resolveLabCompactPointerPoint(1000, 10, STAGE_RECT)).toEqual({ x: 56, y: 0 });
  });

  it("maps cardinal and diagonal pre-hotspot approach samples without entering the shell", () => {
    // Ratios are exact fractions of the 56px logical frame, so compare numerically.
    const near = resolveLabCompactPointerPoint(16, 50, STAGE_RECT);
    expect(near?.x).toBeCloseTo(4.2, 6);
    expect(near?.y).toBeCloseTo(28, 6);
    const far = resolveLabCompactPointerPoint(84, 50, STAGE_RECT);
    expect(far?.x).toBeCloseTo(51.8, 6);
    expect(far?.y).toBeCloseTo(28, 6);
    const cornerNear = resolveLabCompactPointerPoint(22, 22, STAGE_RECT);
    expect(cornerNear?.x).toBeCloseTo(8.4, 6);
    expect(cornerNear?.y).toBeCloseTo(8.4, 6);
    const cornerFar = resolveLabCompactPointerPoint(78, 78, STAGE_RECT);
    expect(cornerFar?.x).toBeCloseTo(47.6, 6);
    expect(cornerFar?.y).toBeCloseTo(47.6, 6);
  });

  it("rejects non-finite input or empty geometry", () => {
    expect(resolveLabCompactPointerPoint(Number.NaN, 50, STAGE_RECT)).toBeNull();
    expect(resolveLabCompactPointerPoint(100, Number.POSITIVE_INFINITY, STAGE_RECT)).toBeNull();
    expect(resolveLabCompactPointerPoint(100, 50, { ...STAGE_RECT, width: 0 })).toBeNull();
  });

  it("writes logical-frame coordinates through MotionValue setters only", () => {
    const field = createFakeField();
    updateLabCompactPointerFromClientPoint(field, 50, 50, STAGE_RECT);
    expect(field.x.set).toHaveBeenCalledWith(28);
    expect(field.y.set).toHaveBeenCalledWith(28);
    expect(field.x.set).toHaveBeenCalledTimes(1);
    expect(field.y.set).toHaveBeenCalledTimes(1);
  });

  it("skips writes for invalid geometry", () => {
    const field = createFakeField();
    updateLabCompactPointerFromClientPoint(field, 50, 50, { ...STAGE_RECT, width: 0 });
    expect(field.x.set).not.toHaveBeenCalled();
    expect(field.y.set).not.toHaveBeenCalled();
  });

  it("resets the field to the Compact attention center", () => {
    const field = createFakeField();
    resetLabCompactPointerToCenter(field);
    expect(field.x.set).toHaveBeenCalledWith(LAB_COMPACT_ATTENTION_CENTER.x);
    expect(field.y.set).toHaveBeenCalledWith(LAB_COMPACT_ATTENTION_CENTER.y);
  });

  it("keeps the attention center at the production outer-frame center", () => {
    expect(LAB_COMPACT_ATTENTION_CENTER).toEqual({ x: 28, y: 28 });
  });
});
