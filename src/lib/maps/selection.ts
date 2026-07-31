import { prefersCoarsePointer } from "./pointer";
import { pointInPolygon } from "./polygons";
import type { MapBox, MapPolygon, MapText, SelectedObject } from "./types";

export type NormalizedPoint = { x: number; y: number };

/** True when selection points at this exact object id + type. */
export function isSelectedObject(
  selection: SelectedObject,
  type: "box" | "text" | "polygon",
  id: string,
): boolean {
  return selection?.type === type && selection.id === id;
}

export function selectBox(id: string): SelectedObject {
  return { type: "box", id };
}

export function selectText(id: string): SelectedObject {
  return { type: "text", id };
}

export function selectPolygon(id: string): SelectedObject {
  return { type: "polygon", id };
}

export function pointInBox(point: NormalizedPoint, box: MapBox): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

/**
 * Approximate half-extents for a text label in normalized map space.
 * Sized from content so longer labels stay selectable/movable.
 */
export function textHitHalfExtents(textItem: MapText): {
  halfWidth: number;
  halfHeight: number;
} {
  // Tuned for single-line uppercase bold labels; coarse pointers get a larger min pad.
  const coarse = prefersCoarsePointer();
  const label = textItem.text.trim() || "Text";
  const halfWidth = Math.min(
    0.45,
    Math.max(coarse ? 0.11 : 0.08, label.length * 0.014),
  );
  const halfHeight = coarse ? 0.055 : 0.04;
  return { halfWidth, halfHeight };
}

/** Text hit target: padded box around the text centre, scaled to label size. */
export function pointInText(
  point: NormalizedPoint,
  textItem: MapText,
  halfWidth?: number,
  halfHeight?: number,
): boolean {
  const extents = textHitHalfExtents(textItem);
  const hw = halfWidth ?? extents.halfWidth;
  const hh = halfHeight ?? extents.halfHeight;
  return (
    point.x >= textItem.x - hw &&
    point.x <= textItem.x + hw &&
    point.y >= textItem.y - hh &&
    point.y <= textItem.y + hh
  );
}

/**
 * Topmost box under a point.
 * Prefer the currently selected box only when it is among the hits (it paints
 * above siblings). Otherwise use paint order: later array entries win.
 * Never collapses multiple hits into a shared layer selection.
 */
export function findTopBoxAtPoint(
  boxes: MapBox[],
  point: NormalizedPoint,
  selectedBoxId: string | null = null,
): MapBox | null {
  const hits = boxes.filter((box) => pointInBox(point, box));
  if (hits.length === 0) return null;
  if (selectedBoxId) {
    const selectedHit = hits.find((box) => box.id === selectedBoxId);
    if (selectedHit) return selectedHit;
  }
  return hits[hits.length - 1] ?? null;
}

export function findTopTextAtPoint(
  texts: MapText[],
  point: NormalizedPoint,
  selectedTextId: string | null = null,
): MapText | null {
  const hits = texts.filter((textItem) => pointInText(point, textItem));
  if (hits.length === 0) return null;
  if (selectedTextId) {
    const selectedHit = hits.find((textItem) => textItem.id === selectedTextId);
    if (selectedHit) return selectedHit;
  }
  return hits[hits.length - 1] ?? null;
}

export function findTopPolygonAtPoint(
  polygons: MapPolygon[],
  point: NormalizedPoint,
  selectedPolygonId: string | null = null,
): MapPolygon | null {
  const hits = polygons.filter((polygon) => pointInPolygon(point, polygon));
  if (hits.length === 0) return null;
  if (selectedPolygonId) {
    const selectedHit = hits.find((polygon) => polygon.id === selectedPolygonId);
    if (selectedHit) return selectedHit;
  }
  return hits[hits.length - 1] ?? null;
}

export type HitTestResult =
  | { kind: "box"; object: MapBox }
  | { kind: "text"; object: MapText }
  | { kind: "polygon"; object: MapPolygon }
  | null;

/**
 * Resolve which single user object a pointer should select.
 * Texts sit above polygons, polygons above boxes.
 */
export function hitTestMapObjects(
  boxes: MapBox[],
  texts: MapText[],
  point: NormalizedPoint,
  selection: SelectedObject,
  polygons: MapPolygon[] = [],
): HitTestResult {
  const selectedTextId = selection?.type === "text" ? selection.id : null;
  const selectedBoxId = selection?.type === "box" ? selection.id : null;
  const selectedPolygonId =
    selection?.type === "polygon" ? selection.id : null;

  const textHit = findTopTextAtPoint(texts, point, selectedTextId);
  if (textHit) {
    return { kind: "text", object: textHit };
  }

  const polygonHit = findTopPolygonAtPoint(
    polygons,
    point,
    selectedPolygonId,
  );
  if (polygonHit) {
    return { kind: "polygon", object: polygonHit };
  }

  const boxHit = findTopBoxAtPoint(boxes, point, selectedBoxId);
  if (boxHit) {
    return { kind: "box", object: boxHit };
  }

  return null;
}

/** Append a box without dropping any existing boxes. */
export function appendBox(boxes: MapBox[], nextBox: MapBox): MapBox[] {
  return [...boxes, nextBox];
}

/** Move only the selected box; leave every other box untouched. */
export function applyMoveToSelectedBox(
  boxes: MapBox[],
  selection: SelectedObject,
  nextBox: MapBox,
): MapBox[] {
  if (!selection || selection.type !== "box") return boxes;
  return boxes.map((box) => (box.id === selection.id ? nextBox : box));
}

/** Update one box by id; never drops siblings. */
export function updateBoxById(
  boxes: MapBox[],
  boxId: string,
  updater: (box: MapBox) => MapBox,
): MapBox[] {
  return boxes.map((box) => (box.id === boxId ? updater(box) : box));
}

/** Resize only the selected box; leave every other box untouched. */
export function applyResizeToSelectedBox(
  boxes: MapBox[],
  selection: SelectedObject,
  nextBox: MapBox,
): MapBox[] {
  if (!selection || selection.type !== "box") return boxes;
  if (nextBox.id !== selection.id) return boxes;
  return boxes.map((box) => (box.id === selection.id ? nextBox : box));
}

/** Colour only the selected object. */
export function applyColorToSelection(
  boxes: MapBox[],
  texts: MapText[],
  selection: SelectedObject,
  color: string,
  polygons: MapPolygon[] = [],
): { boxes: MapBox[]; texts: MapText[]; polygons: MapPolygon[] } {
  if (!selection) return { boxes, texts, polygons };
  if (selection.type === "box") {
    return {
      boxes: boxes.map((box) =>
        box.id === selection.id ? { ...box, color } : box,
      ),
      texts,
      polygons,
    };
  }
  if (selection.type === "polygon") {
    return {
      boxes,
      texts,
      polygons: polygons.map((polygon) =>
        polygon.id === selection.id ? { ...polygon, color } : polygon,
      ),
    };
  }
  return {
    boxes,
    texts: texts.map((textItem) =>
      textItem.id === selection.id ? { ...textItem, color } : textItem,
    ),
    polygons,
  };
}
