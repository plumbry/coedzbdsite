import { describe, expect, it } from "vitest";
import {
  boxesEqual,
  clampBoxToMap,
  moveBox,
  normalizedRectFromDrag,
  resizeBox,
} from "./coordinates";
import type { MapBox } from "./types";

const sampleBox: MapBox = {
  id: "box-1",
  x: 0.2,
  y: 0.2,
  width: 0.3,
  height: 0.25,
  label: "Loot",
  color: "#3B82F6",
};

describe("clampBoxToMap", () => {
  it("keeps boxes inside the unit square", () => {
    const clamped = clampBoxToMap({
      ...sampleBox,
      x: 0.95,
      width: 0.2,
    });

    expect(clamped.x + clamped.width).toBeLessThanOrEqual(1);
  });
});

describe("normalizedRectFromDrag", () => {
  it("creates a rectangle from drag coordinates", () => {
    const rect = normalizedRectFromDrag(
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.5 },
      0.02,
    );

    expect(rect.x).toBeCloseTo(0.1);
    expect(rect.y).toBeCloseTo(0.1);
    expect(rect.width).toBeCloseTo(0.3);
    expect(rect.height).toBeCloseTo(0.4);
  });
});

describe("moveBox", () => {
  it("moves a box while preserving size", () => {
    const moved = moveBox(sampleBox, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.1 });
    expect(moved.x).toBeCloseTo(0.4);
    expect(moved.y).toBeCloseTo(0.4);
    expect(moved.width).toBe(sampleBox.width);
    expect(moved.height).toBe(sampleBox.height);
  });
});

describe("resizeBox", () => {
  it("resizes from the south-east handle", () => {
    const resized = resizeBox(sampleBox, "se", { x: 0.6, y: 0.6 }, 0.01);
    expect(resized.width).toBeCloseTo(0.4);
    expect(resized.height).toBeCloseTo(0.4);
  });
});

describe("boxesEqual", () => {
  it("detects identical box arrays", () => {
    expect(boxesEqual([sampleBox], [{ ...sampleBox }])).toBe(true);
    expect(boxesEqual([sampleBox], [{ ...sampleBox, label: "Changed" }])).toBe(false);
  });
});
