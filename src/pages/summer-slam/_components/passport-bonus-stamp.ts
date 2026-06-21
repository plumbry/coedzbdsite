import type { Id } from "@/convex/_generated/dataModel.d.ts";
import type { QuestEntry } from "./passport-types.ts";
import { getQuestStatus } from "./passport-types.ts";
import type { SealProgress } from "./passport-seal.ts";
import { STAMP_IMAGES } from "./passport-assets.ts";

export const BONUS_STAMP_ID = "summer_legend" as const;
export type BonusStampId = typeof BONUS_STAMP_ID;

export const BONUS_STAMP_META = {
  id: BONUS_STAMP_ID,
  label: "Summer Legend Bonus",
  title: "Summer Legend Stamp",
  tagline: "The rarest mark — earned only by those who complete the entire season.",
  image: STAMP_IMAGES.summer_legend,
  accent: "#9333ea",
  tint: "#faf5ff",
  hiddenLabel: "???",
} as const;

/** Three legendary bonus quests — revealed only after all five main stamps are earned. */
export const BONUS_QUEST_DEFINITIONS = [
  {
    id: "bonus_complete_all",
    title: "Complete Every Category",
    description: "Earn all five Summer Slam stamps before the season ends.",
    stampReward: 5,
  },
  {
    id: "bonus_major_event",
    title: "Major Event Achievement",
    description: "Place Top 3 in a featured Summer Slam championship event.",
    stampReward: 5,
  },
  {
    id: "bonus_season_finale",
    title: "Season Finale",
    description: "Complete Summer Slam with every stamp and bonus quest before the season closes.",
    stampReward: 5,
  },
] as const;

const q = (id: string) => id as Id<"seasonalQuests">;

/** Build bonus quest entries for UI — progress is derived from main passport state. */
export function buildBonusQuestEntries(
  mainSeals: SealProgress[],
  allMainQuestsApproved: boolean,
): QuestEntry[] {
  const mainComplete = mainSeals.every((seal) => seal.state === "earned");

  return BONUS_QUEST_DEFINITIONS.map((def, index) => {
    let status: string = "not_started";
    if (def.id === "bonus_complete_all" && mainComplete) {
      status = "approved";
    } else if (def.id === "bonus_season_finale" && allMainQuestsApproved && mainComplete) {
      status = "not_started";
    }

    return {
      quest: {
        _id: q(`mock_bonus_${index + 1}`),
        title: def.title,
        description: def.description,
        category: BONUS_STAMP_ID,
        completionMethod: "manual" as const,
        stampReward: def.stampReward,
      },
      progress:
        status === "approved"
          ? {
              status: "approved",
              awardSource: "admin" as const,
              approvedAt: Date.now(),
            }
          : null,
    };
  });
}

export function isBonusStampUnlocked(mainSeals: SealProgress[]): boolean {
  return mainSeals.length > 0 && mainSeals.every((seal) => seal.state === "earned");
}

export function countBonusApproved(entries: QuestEntry[]): number {
  return entries.filter((e) => getQuestStatus(e) === "approved").length;
}
