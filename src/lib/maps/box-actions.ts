import type { MapBox, MapSelection, MapText } from "./types";

export function deleteSelectedObject(
  boxes: MapBox[],
  texts: MapText[],
  selection: MapSelection,
): { boxes: MapBox[]; texts: MapText[]; selection: MapSelection } {
  if (!selection) {
    return { boxes, texts, selection };
  }

  if (selection.kind === "box") {
    return {
      boxes: boxes.filter((box) => box.id !== selection.id),
      texts,
      selection: null,
    };
  }

  return {
    boxes,
    texts: texts.filter((textItem) => textItem.id !== selection.id),
    selection: null,
  };
}

/** @deprecated Use deleteSelectedObject */
export function deleteSelectedBox(
  boxes: MapBox[],
  selectedBoxId: string | null,
): { boxes: MapBox[]; selectedBoxId: string | null } {
  if (!selectedBoxId) {
    return { boxes, selectedBoxId };
  }

  return {
    boxes: boxes.filter((box) => box.id !== selectedBoxId),
    selectedBoxId: null,
  };
}

export function shouldIgnoreMapEditorShortcut(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: string; isContentEditable?: boolean };
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function shouldCreateBoxFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  thresholdPx = 4,
): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) >= thresholdPx;
}

export function pointerDistancePx(
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function clampTextCenter(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}
