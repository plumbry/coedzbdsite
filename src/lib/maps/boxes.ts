import { resolveMapBoxColor } from "./box-color";
import { createBoxId } from "./coordinates";
import type { MapBox, MapText } from "./types";

export function normalizeLoadedMapBoxes(
  boxes: Array<Omit<MapBox, "color"> & { color?: string }>,
): MapBox[] {
  return boxes.map((box) => ({
    ...box,
    label: "",
    color: resolveMapBoxColor(box.color),
  }));
}

export function normalizeLoadedMapTexts(
  texts: Array<Omit<MapText, "color"> & { color?: string }> | undefined,
): MapText[] {
  return (texts ?? []).map((textItem) => ({
    ...textItem,
    color: resolveMapBoxColor(textItem.color),
  }));
}

/** Move legacy box.label values into independent text objects once. */
export function migrateLegacyBoxLabelsToTexts(
  boxes: Array<Omit<MapBox, "color"> & { color?: string; label?: string }>,
  texts: Array<Omit<MapText, "color"> & { color?: string }> | undefined,
): { boxes: MapBox[]; texts: MapText[] } {
  const normalizedBoxes = normalizeLoadedMapBoxes(boxes);
  const existingTexts = normalizeLoadedMapTexts(texts);

  if (existingTexts.length > 0) {
    return { boxes: normalizedBoxes, texts: existingTexts };
  }

  const migratedTexts: MapText[] = [];
  for (const box of boxes) {
    const label = box.label?.trim();
    if (!label) continue;
    migratedTexts.push({
      id: createBoxId(),
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      text: label,
      color: resolveMapBoxColor(box.color),
    });
  }

  return {
    boxes: normalizedBoxes,
    texts: migratedTexts,
  };
}

export function textsEqual(a: MapText[], b: MapText[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((textItem, index) => {
    const other = b[index];
    if (!other) return false;
    return (
      textItem.id === other.id &&
      textItem.x === other.x &&
      textItem.y === other.y &&
      textItem.text === other.text &&
      textItem.color === other.color
    );
  });
}
