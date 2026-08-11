import { describe, expect, it, vi } from "vitest";

import {
  resetPointerFieldToCenter,
  resolvePointerFieldCenterPoint,
  resolvePointerFieldPoint,
  updatePointerFieldFromClientPoint,
  type MainWindowPointerField,
} from "./pointerField";

// Pointer coordinates live in local Motion values, not React application
// state. The pure conversion and reset helpers are tested directly; writes
// must go through MotionValue setters only.

const ROOT_RECT = { left: 14, top: 14, width: 200, height: 200 };

const createFakeField = () => ({
  x: { set: vi.fn() },
  y: { set: vi.fn() },
}) as unknown as MainWindowPointerField;

describe("resolvePointerFieldPoint", () => {
  it("converts client coordinates into stable-root-relative points", () => {
    expect(resolvePointerFieldPoint(100, 50, ROOT_RECT)).toEqual({ x: 86, y: 36 });
  });

  it("clamps points into the stable root rect", () => {
    expect(resolvePointerFieldPoint(-50, 400, ROOT_RECT)).toEqual({ x: 0, y: 200 });
    expect(resolvePointerFieldPoint(1000, 10, ROOT_RECT)).toEqual({ x: 200, y: 0 });
  });

  it("returns null for non-finite input or empty geometry", () => {
    expect(resolvePointerFieldPoint(Number.NaN, 50, ROOT_RECT)).toBeNull();
    expect(resolvePointerFieldPoint(100, Number.POSITIVE_INFINITY, ROOT_RECT)).toBeNull();
    expect(resolvePointerFieldPoint(100, 50, { ...ROOT_RECT, width: 0 })).toBeNull();
  });
});

describe("resolvePointerFieldCenterPoint", () => {
  it("resolves the stable root center", () => {
    expect(resolvePointerFieldCenterPoint(200)).toEqual({ x: 100, y: 100 });
  });

  it("returns null for invalid viewport sizes", () => {
    expect(resolvePointerFieldCenterPoint(0)).toBeNull();
    expect(resolvePointerFieldCenterPoint(Number.NaN)).toBeNull();
  });
});

describe("updatePointerFieldFromClientPoint", () => {
  it("writes root-relative coordinates through MotionValue setters only", () => {
    const field = createFakeField();
    updatePointerFieldFromClientPoint(field, 100, 50, ROOT_RECT);
    expect(field.x.set).toHaveBeenCalledWith(86);
    expect(field.y.set).toHaveBeenCalledWith(36);
    expect(field.x.set).toHaveBeenCalledTimes(1);
    expect(field.y.set).toHaveBeenCalledTimes(1);
  });

  it("skips writes for invalid geometry", () => {
    const field = createFakeField();
    updatePointerFieldFromClientPoint(field, 100, 50, { ...ROOT_RECT, width: 0 });
    expect(field.x.set).not.toHaveBeenCalled();
    expect(field.y.set).not.toHaveBeenCalled();
  });
});

describe("resetPointerFieldToCenter", () => {
  it("writes the stable root center on semantic leave", () => {
    const field = createFakeField();
    resetPointerFieldToCenter(field, 200);
    expect(field.x.set).toHaveBeenCalledWith(100);
    expect(field.y.set).toHaveBeenCalledWith(100);
  });

  it("skips writes for invalid viewport sizes", () => {
    const field = createFakeField();
    resetPointerFieldToCenter(field, 0);
    expect(field.x.set).not.toHaveBeenCalled();
  });
});
