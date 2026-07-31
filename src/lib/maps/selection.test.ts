import { describe, expect, it } from "vitest";
import type { MapBox, MapText, SelectedObject } from "./types";
import {
  appendBox,
  applyColorToSelection,
  applyMoveToSelectedBox,
  findTopBoxAtPoint,
  hitTestMapObjects,
  isSelectedObject,
  pointInBox,
  pointInText,
  selectBox,
  selectText,
  textHitHalfExtents,
  updateBoxById,
} from "./selection";

const boxes: MapBox[] = [
  {
    id: "box-a",
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    label: "",
    color: "#FAE904",
  },
  {
    id: "box-b",
    x: 0.5,
    y: 0.5,
    width: 0.2,
    height: 0.2,
    label: "",
    color: "#FAE904",
  },
  {
    // Overlaps box-a; painted later so it wins when nothing is selected.
    id: "box-c",
    x: 0.2,
    y: 0.2,
    width: 0.2,
    height: 0.2,
    label: "",
    color: "#00FF00",
  },
];

const texts: MapText[] = [
  {
    id: "text-1",
    x: 0.55,
    y: 0.55,
    text: "Team",
    color: "#FAE904",
  },
];

describe("isSelectedObject", () => {
  it("matches only the exact type and id", () => {
    const selection: SelectedObject = selectBox("box-a");
    expect(isSelectedObject(selection, "box", "box-a")).toBe(true);
    expect(isSelectedObject(selection, "box", "box-b")).toBe(false);
    expect(isSelectedObject(selection, "text", "box-a")).toBe(false);
    expect(isSelectedObject(null, "box", "box-a")).toBe(false);
  });
});

describe("pointInBox / findTopBoxAtPoint", () => {
  it("detects points inside a single rectangle", () => {
    expect(pointInBox({ x: 0.15, y: 0.15 }, boxes[0]!)).toBe(true);
    expect(pointInBox({ x: 0.55, y: 0.55 }, boxes[0]!)).toBe(false);
  });

  it("selects exactly one topmost box under the pointer", () => {
    const hitA = findTopBoxAtPoint(boxes, { x: 0.15, y: 0.15 });
    expect(hitA?.id).toBe("box-a");

    const hitB = findTopBoxAtPoint(boxes, { x: 0.55, y: 0.55 });
    expect(hitB?.id).toBe("box-b");
  });

  it("prefers the already-selected box when rectangles overlap", () => {
    const overlap = { x: 0.25, y: 0.25 };
    expect(findTopBoxAtPoint(boxes, overlap)?.id).toBe("box-c");
    expect(findTopBoxAtPoint(boxes, overlap, "box-a")?.id).toBe("box-a");
  });
});

describe("pointInText / textHitHalfExtents", () => {
  it("grows the hit target for longer labels so they stay selectable", () => {
    const short = textHitHalfExtents({
      id: "t1",
      x: 0.5,
      y: 0.5,
      text: "Hi",
      color: "#FAE904",
    });
    const long = textHitHalfExtents({
      id: "t2",
      x: 0.5,
      y: 0.5,
      text: "MY TEAM NAME",
      color: "#FAE904",
    });
    expect(long.halfWidth).toBeGreaterThan(short.halfWidth);

    const label = {
      id: "t3",
      x: 0.5,
      y: 0.5,
      text: "MY TEAM",
      color: "#FAE904",
    };
    // Near the edge of a long label — must still hit (old fixed pad missed this).
    expect(pointInText({ x: 0.5 + short.halfWidth + 0.01, y: 0.5 }, label)).toBe(
      true,
    );
  });
});

describe("hitTestMapObjects", () => {
  it("returns a single box id, never every box", () => {
    const hit = hitTestMapObjects(boxes, texts, { x: 0.15, y: 0.15 }, null);
    expect(hit).toEqual({ kind: "box", object: boxes[0] });
  });

  it("prefers text over a box underneath the same point", () => {
    const hit = hitTestMapObjects(boxes, texts, { x: 0.55, y: 0.55 }, null);
    expect(hit).toEqual({ kind: "text", object: texts[0] });
  });

  it("returns null on empty map space", () => {
    expect(hitTestMapObjects(boxes, texts, { x: 0.9, y: 0.1 }, null)).toBeNull();
  });

  it("selects existing text instead of treating the click as empty space", () => {
    const label: MapText = {
      id: "team",
      x: 0.4,
      y: 0.3,
      text: "MY TEAM",
      color: "#FAE904",
    };
    const hit = hitTestMapObjects(boxes, [label], { x: 0.45, y: 0.3 }, null);
    expect(hit).toEqual({ kind: "text", object: label });
  });
});

describe("applyMoveToSelectedBox", () => {
  it("moves only the selected rectangle", () => {
    const selection = selectBox("box-a");
    const moved = { ...boxes[0]!, x: 0.3, y: 0.3 };
    const next = applyMoveToSelectedBox(boxes, selection, moved);
    expect(next[0]).toEqual(moved);
    expect(next[1]).toEqual(boxes[1]);
    expect(next[2]).toEqual(boxes[2]);
  });

  it("does not move any box when selection is a text object", () => {
    const next = applyMoveToSelectedBox(boxes, selectText("text-1"), {
      ...boxes[0]!,
      x: 0.9,
    });
    expect(next).toEqual(boxes);
  });
});

describe("applyColorToSelection", () => {
  it("recolours only the selected object", () => {
    const result = applyColorToSelection(boxes, texts, selectBox("box-b"), "#FF0000");
    expect(result.boxes[0]?.color).toBe("#FAE904");
    expect(result.boxes[1]?.color).toBe("#FF0000");
    expect(result.texts[0]?.color).toBe("#FAE904");
  });
});

describe("appendBox / updateBoxById", () => {
  it("keeps every existing box when appending a new one", () => {
    const next = {
      id: "box-d",
      x: 0.8,
      y: 0.8,
      width: 0.1,
      height: 0.1,
      label: "",
      color: "#FAE904",
    };
    const result = appendBox(boxes, next);
    expect(result).toHaveLength(4);
    expect(result.map((box) => box.id)).toEqual([
      "box-a",
      "box-b",
      "box-c",
      "box-d",
    ]);
  });

  it("updating one box never drops siblings (select-original regression)", () => {
    const result = updateBoxById(boxes, "box-a", (box) => ({
      ...box,
      x: 0.12,
    }));
    expect(result).toHaveLength(3);
    expect(result.map((box) => box.id)).toEqual(["box-a", "box-b", "box-c"]);
    expect(result[0]?.x).toBe(0.12);
    expect(result[1]).toEqual(boxes[1]);
  });
});
