import type { QuestEntry } from "./passport-types.ts";
import { getQuestStatus } from "./passport-types.ts";

export type PassportTier = {
  /** Display level number (1–7). */
  level: number;
  title: string;
  minPoints: number;
  maxPoints: number | null;
};

export const PASSPORT_TIERS: PassportTier[] = [
  { level: 1, title: "Explorer I", minPoints: 0, maxPoints: 2 },
  { level: 2, title: "Explorer II", minPoints: 3, maxPoints: 5 },
  { level: 3, title: "Explorer III", minPoints: 6, maxPoints: 8 },
  { level: 4, title: "Adventurer I", minPoints: 9, maxPoints: 11 },
  { level: 5, title: "Adventurer II", minPoints: 12, maxPoints: 14 },
  { level: 6, title: "Adventurer III", minPoints: 15, maxPoints: 17 },
  { level: 7, title: "Summer Legend", minPoints: 18, maxPoints: null },
];

export function computeQuestPoints(quests: QuestEntry[]): number {
  return quests
    .filter((entry) => getQuestStatus(entry) === "approved")
    .reduce((sum, entry) => sum + entry.quest.stampReward, 0);
}

export function getPassportTier(questPoints: number): PassportTier {
  for (let i = PASSPORT_TIERS.length - 1; i >= 0; i -= 1) {
    const tier = PASSPORT_TIERS[i]!;
    if (questPoints >= tier.minPoints) return tier;
  }
  return PASSPORT_TIERS[0]!;
}
