import { describe, expect, it } from "vitest";
import {
  deleteSelectedObject,
  shouldCreateBoxFromDrag,
  shouldIgnoreMapEditorShortcut,
} from "./box-actions";
import type { MapBox, MapText } from "./types";

const sampleBoxes: MapBox[] = [
  {
    id: "a",
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    label: "",
    color: "#FF0000",
  },
  {
    id: "b",
    x: 0.5,
    y: 0.5,
    width: 0.2,
    height: 0.2,
    label: "",
    color: "#00FF00",
  },
];

const sampleTexts: MapText[] = [
  {
    id: "t1",
    x: 0.3,
    y: 0.3,
    text: "Line one",
    color: "#0000FF",
  },
];

describe("deleteSelectedObject", () => {
  it("deletes only the selected rectangle", () => {
    const result = deleteSelectedObject(sampleBoxes, sampleTexts, {
      type: "box",
      id: "a",
    });
    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]?.id).toBe("b");
    expect(result.texts).toHaveLength(1);
    expect(result.selection).toBeNull();
  });

  it("deletes only the selected text", () => {
    const result = deleteSelectedObject(sampleBoxes, sampleTexts, {
      type: "text",
      id: "t1",
    });
    expect(result.boxes).toHaveLength(2);
    expect(result.texts).toHaveLength(0);
    expect(result.selection).toBeNull();
  });

  it("no-ops when nothing is selected", () => {
    const result = deleteSelectedObject(sampleBoxes, sampleTexts, null);
    expect(result.boxes).toEqual(sampleBoxes);
    expect(result.texts).toEqual(sampleTexts);
    expect(result.polygons).toEqual([]);
    expect(result.selection).toBeNull();
  });

  it("deletes only the selected polygon", () => {
    const polygons = [
      {
        id: "p1",
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.3, y: 0.1 },
          { x: 0.2, y: 0.3 },
        ],
        color: "#FAE904",
      },
    ];
    const result = deleteSelectedObject(sampleBoxes, sampleTexts, {
      type: "polygon",
      id: "p1",
    }, polygons);
    expect(result.polygons).toHaveLength(0);
    expect(result.boxes).toHaveLength(2);
    expect(result.selection).toBeNull();
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
      shouldIgnoreMapEditorShortcut({
        tagName: "TEXTAREA",
        isContentEditable: false,
      } as HTMLElement),
    ).toBe(true);
    expect(
      shouldIgnoreMapEditorShortcut({ tagName: "DIV", isContentEditable: false } as HTMLElement),
    ).toBe(false);
  });
});
