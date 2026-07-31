import type { MapPolygon } from "./types";

export type PolygonsAction =
  | { type: "hydrate"; polygons: MapPolygon[] }
  | { type: "append"; polygon: MapPolygon }
  | { type: "patch"; id: string; polygon: MapPolygon }
  | { type: "remove"; id: string };

export function dedupePolygonsById(polygons: MapPolygon[]): MapPolygon[] {
  const seen = new Set<string>();
  const result: MapPolygon[] = [];
  for (const polygon of polygons) {
    if (seen.has(polygon.id)) continue;
    seen.add(polygon.id);
    result.push(polygon);
  }
  return result;
}

export function polygonsReducer(
  state: MapPolygon[],
  action: PolygonsAction,
): MapPolygon[] {
  switch (action.type) {
    case "hydrate":
      return dedupePolygonsById(action.polygons);
    case "append": {
      if (state.some((polygon) => polygon.id === action.polygon.id)) {
        return state;
      }
      return [...state, action.polygon];
    }
    case "patch": {
      let found = false;
      const next = state.map((polygon) => {
        if (polygon.id !== action.id) return polygon;
        found = true;
        return action.polygon.id === action.id
          ? action.polygon
          : { ...action.polygon, id: action.id };
      });
      return found ? next : state;
    }
    case "remove":
      return state.filter((polygon) => polygon.id !== action.id);
    default:
      return state;
  }
}
