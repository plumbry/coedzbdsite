import { ConvexError } from "convex/values";

export const MAP_BOX_MIN_SIZE = 0.01;
export const MAP_BOX_LABEL_MAX_LENGTH = 100;
export const MAP_BOXES_MAX_COUNT = 200;

export type MapBoxInput = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function assertNormalized(value: number, field: string): void {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw new ConvexError(`Invalid ${field}: must be between 0 and 1`);
  }
}

export function normalizeMapBoxLabel(label: string): string {
  return label.trim().slice(0, MAP_BOX_LABEL_MAX_LENGTH);
}

export function validateMapBox(box: MapBoxInput): MapBoxInput {
  if (!box.id || typeof box.id !== "string") {
    throw new ConvexError("Invalid box id");
  }

  assertNormalized(box.x, "x");
  assertNormalized(box.y, "y");
  assertNormalized(box.width, "width");
  assertNormalized(box.height, "height");

  if (box.width < MAP_BOX_MIN_SIZE || box.height < MAP_BOX_MIN_SIZE) {
    throw new ConvexError("Box width and height must meet the minimum size");
  }

  if (box.x + box.width > 1 + 1e-9) {
    throw new ConvexError("Box extends beyond the map width");
  }

  if (box.y + box.height > 1 + 1e-9) {
    throw new ConvexError("Box extends beyond the map height");
  }

  return {
    id: box.id,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    label: normalizeMapBoxLabel(box.label),
  };
}

export function validateMapBoxes(boxes: MapBoxInput[]): MapBoxInput[] {
  if (boxes.length > MAP_BOXES_MAX_COUNT) {
    throw new ConvexError(`Maps may contain at most ${MAP_BOXES_MAX_COUNT} boxes`);
  }

  const seenIds = new Set<string>();
  return boxes.map((box) => {
    const validated = validateMapBox(box);
    if (seenIds.has(validated.id)) {
      throw new ConvexError("Duplicate box id");
    }
    seenIds.add(validated.id);
    return validated;
  });
}
