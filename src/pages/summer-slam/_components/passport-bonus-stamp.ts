import type { QuestEntry } from "./passport-types.ts";
import { getQuestStatus } from "./passport-types.ts";
import type { SealProgress } from "./passport-seal.ts";
import { STAMP_IMAGES } from "./passport-assets.ts";

export const BONUS_STAMP_ID = "summer_legend" as const;
export type BonusStampId = typeof BONUS_STAMP_ID;

export const BONUS_STAMP_META = {
  id: BONUS_STAMP_ID,
  label: "Summer Legend",
  title: "Summer Legend Stamp",
  tagline: "The rarest mark — earned only by those who complete the entire season.",
  image: STAMP_IMAGES.summer_legend,
  accent: "#9333ea",
  tint: "#faf5ff",
  hiddenLabel: "???",
} as const;

export function isBonusQuestCategory(category: string): boolean {
  return category === BONUS_STAMP_ID;
}

export function isBonusStampUnlocked(mainSeals: SealProgress[]): boolean {
  return mainSeals.length > 0 && mainSeals.every((seal) => seal.state === "earned");
}

export function countBonusApproved(entries: QuestEntry[]): number {
  return entries.filter((e) => getQuestStatus(e) === "approved").length;
}
