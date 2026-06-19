import { CategorySealFromEntry } from "./passport-category-seals.tsx";
import type { QuestEntry } from "./passport-types.ts";

type CategoryStyle = {
  stampBorder: string;
  stampBg: string;
  stampText: string;
};

export function getSlotRotation(slotIndex: number) {
  const rotations = [-7, 5, -4] as const;
  return rotations[slotIndex % rotations.length];
}

export function PassportStampMark({
  entry,
  category,
  slotIndex,
  size = "md",
}: {
  entry: QuestEntry | null;
  category: CategoryStyle & { id?: string; emoji?: string };
  slotIndex: number;
  size?: "sm" | "md";
}) {
  const categoryId = entry?.quest.category ?? category.id ?? "traveller";
  const pixelSize = size === "sm" ? 40 : 44;

  return (
    <CategorySealFromEntry
      entry={entry}
      categoryId={categoryId}
      slotIndex={slotIndex}
      size={pixelSize}
    />
  );
}
