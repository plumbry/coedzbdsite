import { ConvexError } from "convex/values";

export const MAP_BOX_DEFAULT_COLOR = "#FAE904";
export const MAP_BOX_MIN_SIZE = 0.01;
export const MAP_BOX_LABEL_MAX_LENGTH = 100;
export const MAP_TEXT_MAX_LENGTH = 200;
export const MAP_BOXES_MAX_COUNT = 200;
export const MAP_TEXTS_MAX_COUNT = 400;
export const MAP_POLYGONS_MAX_COUNT = 100;
export const MAP_POLYGON_MIN_POINTS = 3;
export const MAP_POLYGON_MAX_POINTS = 32;

export type MapBoxInput = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color?: string;
};

export type MapTextInput = {
  id: string;
  x: number;
  y: number;
  text: string;
  color?: string;
};

export type MapPolygonPointInput = {
  x: number;
  y: number;
};

export type MapPolygonInput = {
  id: string;
  points: MapPolygonPointInput[];
  color?: string;
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

const HEX_SHORT_PATTERN = /^#([0-9A-Fa-f]{3})$/;
const HEX_LONG_PATTERN = /^#([0-9A-Fa-f]{6})$/;

export function normalizeMapBoxColor(color: string | undefined): string {
  const value = color?.trim() ?? MAP_BOX_DEFAULT_COLOR;
  const shortMatch = value.match(HEX_SHORT_PATTERN);
  let normalized: string;
  if (shortMatch) {
    const [r, g, b] = shortMatch[1]!;
    normalized = `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  } else {
    const longMatch = value.match(HEX_LONG_PATTERN);
    if (!longMatch) {
      throw new ConvexError("Invalid box color: must be #RGB or #RRGGBB");
    }
    normalized = `#${longMatch[1]!.toUpperCase()}`;
  }

  if (!/^#[0-9A-F]{6}$/.test(normalized)) {
    throw new ConvexError("Invalid box color: must normalize to #RRGGBB");
  }

  return normalized;
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
    color: normalizeMapBoxColor(box.color),
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

export function normalizeMapTextContent(text: string): string {
  return text.replace(/\r\n/g, "\n").slice(0, MAP_TEXT_MAX_LENGTH);
}

export function validateMapText(textItem: MapTextInput): MapTextInput {
  if (!textItem.id || typeof textItem.id !== "string") {
    throw new ConvexError("Invalid text id");
  }

  assertNormalized(textItem.x, "x");
  assertNormalized(textItem.y, "y");

  return {
    id: textItem.id,
    x: textItem.x,
    y: textItem.y,
    text: normalizeMapTextContent(textItem.text),
    color: normalizeMapBoxColor(textItem.color),
  };
}

export function validateMapTexts(texts: MapTextInput[]): MapTextInput[] {
  if (texts.length > MAP_TEXTS_MAX_COUNT) {
    throw new ConvexError(`Maps may contain at most ${MAP_TEXTS_MAX_COUNT} text labels`);
  }

  const seenIds = new Set<string>();
  return texts.map((textItem) => {
    const validated = validateMapText(textItem);
    if (seenIds.has(validated.id)) {
      throw new ConvexError("Duplicate text id");
    }
    seenIds.add(validated.id);
    return validated;
  });
}

export function validateMapPolygon(polygon: MapPolygonInput): MapPolygonInput {
  if (!polygon.id || typeof polygon.id !== "string") {
    throw new ConvexError("Invalid polygon id");
  }

  if (!Array.isArray(polygon.points)) {
    throw new ConvexError("Invalid polygon points");
  }

  if (
    polygon.points.length < MAP_POLYGON_MIN_POINTS ||
    polygon.points.length > MAP_POLYGON_MAX_POINTS
  ) {
    throw new ConvexError(
      `Polygons must have between ${MAP_POLYGON_MIN_POINTS} and ${MAP_POLYGON_MAX_POINTS} points`,
    );
  }

  const points = polygon.points.map((point, index) => {
    assertNormalized(point.x, `points[${index}].x`);
    assertNormalized(point.y, `points[${index}].y`);
    return { x: point.x, y: point.y };
  });

  return {
    id: polygon.id,
    points,
    color: normalizeMapBoxColor(polygon.color),
  };
}

export function validateMapPolygons(polygons: MapPolygonInput[]): MapPolygonInput[] {
  if (polygons.length > MAP_POLYGONS_MAX_COUNT) {
    throw new ConvexError(
      `Maps may contain at most ${MAP_POLYGONS_MAX_COUNT} polygons`,
    );
  }

  const seenIds = new Set<string>();
  return polygons.map((polygon) => {
    const validated = validateMapPolygon(polygon);
    if (seenIds.has(validated.id)) {
      throw new ConvexError("Duplicate polygon id");
    }
    seenIds.add(validated.id);
    return validated;
  });
}
