import { MAP_BOX_MIN_SIZE } from "./constants";
import type { MapBox } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampBoxToMap(box: MapBox): MapBox {
  const width = clamp(box.width, MAP_BOX_MIN_SIZE, 1);
  const height = clamp(box.height, MAP_BOX_MIN_SIZE, 1);
  const x = clamp(box.x, 0, 1 - width);
  const y = clamp(box.y, 0, 1 - height);

  return {
    ...box,
    x,
    y,
    width,
    height,
  };
}

export function boxesEqual(a: MapBox[], b: MapBox[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((box, index) => {
    const other = b[index];
    if (!other) return false;
    return (
      box.id === other.id &&
      box.x === other.x &&
      box.y === other.y &&
      box.width === other.width &&
      box.height === other.height &&
      box.label === other.label
    );
  });
}

export function createBoxId(): string {
  return crypto.randomUUID();
}

export type NormalizedPoint = { x: number; y: number };

export function pointToNormalized(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): NormalizedPoint {
  return {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1),
  };
}

export function normalizedRectFromDrag(
  start: NormalizedPoint,
  end: NormalizedPoint,
  minSize: number,
): Pick<MapBox, "x" | "y" | "width" | "height"> {
  const x1 = Math.min(start.x, end.x);
  const y1 = Math.min(start.y, end.y);
  const x2 = Math.max(start.x, end.x);
  const y2 = Math.max(start.y, end.y);

  let width = Math.max(x2 - x1, minSize);
  let height = Math.max(y2 - y1, minSize);
  let x = x1;
  let y = y1;

  if (x + width > 1) x = 1 - width;
  if (y + height > 1) y = 1 - height;

  return clampBoxToMap({
    id: "draft",
    x,
    y,
    width,
    height,
    label: "",
  });
}

export type ResizeHandle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

export function resizeBox(
  box: MapBox,
  handle: ResizeHandle,
  pointer: NormalizedPoint,
  minSize: number,
): MapBox {
  let { x, y, width, height } = box;
  const right = x + width;
  const bottom = y + height;

  if (handle.includes("w")) {
    const nextX = clamp(pointer.x, 0, right - minSize);
    width = right - nextX;
    x = nextX;
  }
  if (handle.includes("e")) {
    width = clamp(pointer.x - x, minSize, 1 - x);
  }
  if (handle.includes("n")) {
    const nextY = clamp(pointer.y, 0, bottom - minSize);
    height = bottom - nextY;
    y = nextY;
  }
  if (handle.includes("s")) {
    height = clamp(pointer.y - y, minSize, 1 - y);
  }

  return clampBoxToMap({ ...box, x, y, width, height });
}

export function moveBox(box: MapBox, pointer: NormalizedPoint, grabOffset: NormalizedPoint): MapBox {
  return clampBoxToMap({
    ...box,
    x: pointer.x - grabOffset.x,
    y: pointer.y - grabOffset.y,
    width: box.width,
    height: box.height,
  });
}
