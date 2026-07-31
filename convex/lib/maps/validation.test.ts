import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  MAP_BOX_LABEL_MAX_LENGTH,
  MAP_BOX_MIN_SIZE,
  normalizeMapBoxLabel,
  validateMapBox,
  validateMapBoxes,
} from "./validation";

describe("validateMapBox", () => {
  it("accepts a valid box", () => {
    const box = validateMapBox({
      id: "box-1",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.25,
      label: " Tilted Towers ",
    });

    expect(box.label).toBe("Tilted Towers");
  });

  it("rejects coordinates outside 0..1", () => {
    expect(() =>
      validateMapBox({
        id: "box-1",
        x: -0.01,
        y: 0.2,
        width: 0.3,
        height: 0.25,
        label: "A",
      }),
    ).toThrow(ConvexError);
  });

  it("rejects boxes smaller than the minimum size", () => {
    expect(() =>
      validateMapBox({
        id: "box-1",
        x: 0,
        y: 0,
        width: MAP_BOX_MIN_SIZE / 2,
        height: 0.2,
        label: "A",
      }),
    ).toThrow(ConvexError);
  });

  it("rejects boxes that extend beyond the map", () => {
    expect(() =>
      validateMapBox({
        id: "box-1",
        x: 0.9,
        y: 0.2,
        width: 0.2,
        height: 0.2,
        label: "A",
      }),
    ).toThrow(ConvexError);
  });

  it("truncates labels to the max length", () => {
    const label = "x".repeat(MAP_BOX_LABEL_MAX_LENGTH + 10);
    expect(normalizeMapBoxLabel(label).length).toBe(MAP_BOX_LABEL_MAX_LENGTH);
  });
});

describe("validateMapBoxes", () => {
  it("rejects duplicate ids", () => {
    expect(() =>
      validateMapBoxes([
        {
          id: "dup",
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.2,
          label: "One",
        },
        {
          id: "dup",
          x: 0.5,
          y: 0.5,
          width: 0.2,
          height: 0.2,
          label: "Two",
        },
      ]),
    ).toThrow(ConvexError);
  });
});
