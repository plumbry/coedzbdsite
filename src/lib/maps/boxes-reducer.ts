import type { MapBox } from "./types";

export type BoxesAction =
  | { type: "hydrate"; boxes: MapBox[] }
  | { type: "append"; box: MapBox }
  | { type: "patch"; id: string; box: MapBox }
  | { type: "remove"; id: string };

/** Drop duplicate ids, keeping the first occurrence. */
export function dedupeBoxesById(boxes: MapBox[]): MapBox[] {
  const seen = new Set<string>();
  const result: MapBox[] = [];
  for (const box of boxes) {
    if (seen.has(box.id)) continue;
    seen.add(box.id);
    result.push(box);
  }
  return result;
}

/**
 * Single reducer for annotation boxes. Every transition preserves unrelated
 * siblings — append/patch never replace the whole list unless hydrating.
 */
export function boxesReducer(state: MapBox[], action: BoxesAction): MapBox[] {
  switch (action.type) {
    case "hydrate":
      return dedupeBoxesById(action.boxes);
    case "append": {
      if (state.some((box) => box.id === action.box.id)) {
        return state;
      }
      return [...state, action.box];
    }
    case "patch": {
      let found = false;
      const next = state.map((box) => {
        if (box.id !== action.id) return box;
        found = true;
        return action.box.id === action.id ? action.box : { ...action.box, id: action.id };
      });
      return found ? next : state;
    }
    case "remove":
      return state.filter((box) => box.id !== action.id);
    default:
      return state;
  }
}
