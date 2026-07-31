import { describe, expect, it } from "vitest";
import {
  deleteSelectedBox,
  shouldCreateBoxFromDrag,
  shouldIgnoreMapEditorShortcut,
} from "./box-actions";
import type { MapBox } from "./types";

const sampleBoxes: MapBox[] = [
  {
    id: "a",
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    label: "A",
    color: "#FF0000",
  },
  {
    id: "b",
    x: 0.5,
    y: 0.5,
    width: 0.2,
    height: 0.2,
    label: "B",
    color: "#00FF00",
  },
];

describe("deleteSelectedBox", () => {
  it("deletes only the selected rectangle", () => {
    const result = deleteSelectedBox(sampleBoxes, "a");
    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]?.id).toBe("b");
    expect(result.selectedBoxId).toBeNull();
  });

  it("no-ops when nothing is selected", () => {
    const result = deleteSelectedBox(sampleBoxes, null);
    expect(result.boxes).toEqual(sampleBoxes);
    expect(result.selectedBoxId).toBeNull();
  });
});

describe("shouldCreateBoxFromDrag", () => {
  it("requires a 4px drag threshold", () => {
    expect(shouldCreateBoxFromDrag({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
    expect(shouldCreateBoxFromDrag({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });
});

describe("shouldIgnoreMapEditorShortcut", () => {
  it("ignores keyboard shortcuts while editing form fields", () => {
    expect(
      shouldIgnoreMapEditorShortcut({ tagName: "INPUT", isContentEditable: false } as HTMLElement),
    ).toBe(true);
    expect(
      shouldIgnoreMapEditorShortcut({ tagName: "TEXTAREA", isContentEditable: false } as HTMLElement),
    ).toBe(true);
    expect(
      shouldIgnoreMapEditorShortcut({ tagName: "DIV", isContentEditable: false } as HTMLElement),
    ).toBe(false);
  });
});
