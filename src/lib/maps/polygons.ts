import { resolveMapBoxColor } from "./box-color";
import type { MapPolygon, MapPolygonPoint } from "./types";

export function normalizeLoadedMapPolygons(
  polygons: Array<Omit<MapPolygon, "color"> & { color?: string }> | undefined,
): MapPolygon[] {
  return (polygons ?? []).map((polygon) => ({
    id: polygon.id,
    points: polygon.points.map((point) => ({ x: point.x, y: point.y })),
    color: resolveMapBoxColor(polygon.color),
  }));
}

export function polygonsEqual(a: MapPolygon[], b: MapPolygon[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((polygon, index) => {
    const other = b[index];
    if (!other) return false;
    if (
      polygon.id !== other.id ||
      polygon.color !== other.color ||
      polygon.points.length !== other.points.length
    ) {
      return false;
    }
    return polygon.points.every(
      (point, pointIndex) =>
        point.x === other.points[pointIndex]?.x &&
        point.y === other.points[pointIndex]?.y,
    );
  });
}

export function polygonBounds(points: MapPolygonPoint[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/** Ray-cast fill test for a closed polygon. */
export function pointInPolygon(
  point: MapPolygonPoint,
  polygon: MapPolygon,
): boolean {
  const pts = polygon.points;
  if (pts.length < 3) return false;

  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x;
    const yi = pts[i]!.y;
    const xj = pts[j]!.x;
    const yj = pts[j]!.y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Translate a polygon by dragging from an AABB grab offset, clamped so every
 * vertex stays inside the unit square.
 */
export function movePolygon(
  polygon: MapPolygon,
  pointer: MapPolygonPoint,
  grabOffset: MapPolygonPoint,
): MapPolygon {
  const bounds = polygonBounds(polygon.points);
  let dx = pointer.x - grabOffset.x - bounds.x;
  let dy = pointer.y - grabOffset.y - bounds.y;

  dx = Math.min(1 - (bounds.x + bounds.width), Math.max(-bounds.x, dx));
  dy = Math.min(1 - (bounds.y + bounds.height), Math.max(-bounds.y, dy));

  return {
    ...polygon,
    points: polygon.points.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    })),
  };
}

export function pointsToSvgPath(points: MapPolygonPoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x * 100} ${first!.y * 100}`;
  for (const point of rest) {
    d += ` L ${point.x * 100} ${point.y * 100}`;
  }
  return `${d} Z`;
}

export function draftPointsToSvgPath(
  points: MapPolygonPoint[],
  cursor: MapPolygonPoint | null,
): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x * 100} ${first!.y * 100}`;
  for (const point of rest) {
    d += ` L ${point.x * 100} ${point.y * 100}`;
  }
  if (cursor) {
    d += ` L ${cursor.x * 100} ${cursor.y * 100}`;
  }
  return d;
}
