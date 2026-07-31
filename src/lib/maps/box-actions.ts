import type { MapBox } from "./types";

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
