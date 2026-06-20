import { MOCK_CAMPAIGN, MOCK_QUEST_ENTRIES } from "./passport-mock-data.ts";
import type { EvidenceInput } from "./passport-quest-meta.ts";

/**
 * Static mock dataset powering the read-only Summer Slam admin demo at
 * /summer-slam/admin/demo. Nothing here touches Convex — every action in the
 * demo page is a no-op that surfaces a toast instead of mutating data.
 */

export type AdminCategory =
  | "traveller"
  | "competitor"
  | "summer_spirit"
  | "team_player"
  | "community";

export const ADMIN_CATEGORY_LABELS: Record<AdminCategory, string> = {
  traveller: "Traveller",
  competitor: "Competitor",
  summer_spirit: "Summer Spirit",
  team_player: "Team Player",
  community: "Community",
};

export type DemoQuest = {
  _id: string;
  title: string;
  category: AdminCategory;
  description: string;
  evidenceInstructions?: string;
  adminHint?: string;
  completionMethod: "auto" | "manual" | "admin";
  evidenceInput?: EvidenceInput;
  stampReward: number;
  sortOrder: number;
  isActive: boolean;
};

export const DEMO_CAMPAIGN = {
  title: MOCK_CAMPAIGN.title,
  description:
    "Five seasonal stamps, fifteen quests, and a summer-long chase for prize wheel tickets.",
  isActive: true,
  stampName: MOCK_CAMPAIGN.stampName,
  littleWheelEntryEveryStamps: MOCK_CAMPAIGN.littleWheelEntryEveryStamps,
  bigWheelEntryEveryStamps: MOCK_CAMPAIGN.bigWheelEntryEveryStamps,
};

export const DEMO_QUESTS: DemoQuest[] = MOCK_QUEST_ENTRIES.map((entry, index) => ({
  _id: entry.quest._id as unknown as string,
  title: entry.quest.title,
  category: entry.quest.category as AdminCategory,
  description: entry.quest.description,
  evidenceInstructions: entry.quest.evidenceInstructions,
  adminHint: entry.quest.adminHint,
  completionMethod: entry.quest.completionMethod,
  evidenceInput:
    entry.quest.completionMethod === "manual"
      ? ("link" as const)
      : undefined,
  stampReward: entry.quest.stampReward,
  sortOrder: (index + 1) * 10,
  isActive: true,
}));

export type DemoReviewRow = {
  id: string;
  discordUsername: string;
  epicUsername: string;
  questTitle: string;
  category: AdminCategory;
  evidenceTypes: string[];
  evidenceUrls: string[];
  notes?: string;
  status: "pending_review" | "approved" | "rejected" | "needs_more_evidence";
};

export const DEMO_REVIEW_QUEUE: DemoReviewRow[] = [
  {
    id: "demo_sub_1",
    discordUsername: "PlumBry",
    epicUsername: "PlumBry_FN",
    questTitle: "Road Trip Regular",
    category: "traveller",
    evidenceTypes: ["screenshot_link"],
    evidenceUrls: ["https://example.com/plumbry-events.png"],
    notes: "Played 5 different Summer Slam events this week.",
    status: "pending_review",
  },
  {
    id: "demo_sub_2",
    discordUsername: "NovaByte",
    epicUsername: "Nova_FN",
    questTitle: "Top 10 Finish",
    category: "competitor",
    evidenceTypes: ["yunite_link"],
    evidenceUrls: ["https://yunite.xyz/match/nova-top10"],
    notes: "Top 6 in the Trios cup.",
    status: "pending_review",
  },
  {
    id: "demo_sub_3",
    discordUsername: "ReefRunner",
    epicUsername: "Reef_FN",
    questTitle: "Beach Vibes Clip",
    category: "summer_spirit",
    evidenceTypes: ["clip_link"],
    evidenceUrls: ["https://medal.tv/clips/reef-beach-vibes"],
    status: "pending_review",
  },
  {
    id: "demo_sub_4",
    discordUsername: "SoloQueen",
    epicUsername: "SoloQ_FN",
    questTitle: "Community Screenshot",
    category: "community",
    evidenceTypes: ["image"],
    evidenceUrls: ["https://example.com/soloqueen-community.png"],
    status: "approved",
  },
];

export type DemoPassport = {
  id: string;
  discordUsername: string;
  epicUsername: string;
  createdAt: number;
  approvedStamps: number;
  littleWheelEntries: number;
  bigWheelEntries: number;
  completedQuests: number;
};

const day = (daysAgo: number) => Date.now() - daysAgo * 86_400_000;

export const DEMO_PASSPORTS: DemoPassport[] = [
  {
    id: "demo_pp_ace",
    discordUsername: "AceWilds",
    epicUsername: "AceWilds_FN",
    createdAt: day(17),
    approvedStamps: 15,
    littleWheelEntries: 15,
    bigWheelEntries: 3,
    completedQuests: 15,
  },
  {
    id: "demo_pp_zephyr",
    discordUsername: "ZephyrTTV",
    epicUsername: "Zephyr_FN",
    createdAt: day(15),
    approvedStamps: 12,
    littleWheelEntries: 12,
    bigWheelEntries: 2,
    completedQuests: 12,
  },
  {
    id: "demo_pp_nova",
    discordUsername: "NovaByte",
    epicUsername: "Nova_FN",
    createdAt: day(12),
    approvedStamps: 9,
    littleWheelEntries: 9,
    bigWheelEntries: 1,
    completedQuests: 9,
  },
  {
    id: "demo_pp_reef",
    discordUsername: "ReefRunner",
    epicUsername: "Reef_FN",
    createdAt: day(9),
    approvedStamps: 6,
    littleWheelEntries: 6,
    bigWheelEntries: 1,
    completedQuests: 6,
  },
  {
    id: "demo_pp_solo",
    discordUsername: "SoloQueen",
    epicUsername: "SoloQ_FN",
    createdAt: day(5),
    approvedStamps: 3,
    littleWheelEntries: 3,
    bigWheelEntries: 0,
    completedQuests: 3,
  },
  {
    id: "demo_pp_plum",
    discordUsername: "PlumBry",
    epicUsername: "PlumBry_FN",
    createdAt: day(2),
    approvedStamps: 1,
    littleWheelEntries: 1,
    bigWheelEntries: 0,
    completedQuests: 1,
  },
];

export const DEMO_COUNTS = {
  taggedEvents: 9,
  activeQuests: DEMO_QUESTS.filter((quest) => quest.isActive).length,
  pendingSubmissions: DEMO_REVIEW_QUEUE.filter((row) => row.status === "pending_review").length,
  approvedStamps: DEMO_PASSPORTS.reduce((sum, passport) => sum + passport.approvedStamps, 0),
};
