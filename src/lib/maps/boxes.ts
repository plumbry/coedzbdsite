import { resolveMapBoxColor } from "./box-color";
import type { MapBox } from "./types";

export function normalizeLoadedMapBoxes(
  boxes: Array<Omit<MapBox, "color"> & { color?: string }>,
): MapBox[] {
  return boxes.map((box) => ({
    ...box,
    color: resolveMapBoxColor(box.color),
  }));
}
