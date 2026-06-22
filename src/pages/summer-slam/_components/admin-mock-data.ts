import { MOCK_CAMPAIGN, MOCK_QUEST_ENTRIES } from "./passport-mock-data.ts";
import type { EvidenceInput } from "./passport-quest-meta.ts";
import type { QuestEntry } from "./passport-types.ts";

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

export type DemoCampaignConfig = typeof DEMO_CAMPAIGN;

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

export type DemoAdminConfig = {
  campaign: DemoCampaignConfig;
  quests: DemoQuest[];
  updatedAt: number;
};

export const DEMO_ADMIN_CONFIG_STORAGE_KEY = "summer-slam-admin-demo-config";

function cloneDemoQuests(quests: DemoQuest[]) {
  return quests.map((quest) => ({ ...quest }));
}

export function getDefaultDemoAdminConfig(): DemoAdminConfig {
  return {
    campaign: { ...DEMO_CAMPAIGN },
    quests: cloneDemoQuests(DEMO_QUESTS),
    updatedAt: Date.now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normaliseDemoCampaign(value: unknown): DemoCampaignConfig {
  if (!isRecord(value)) return { ...DEMO_CAMPAIGN };
  return {
    title: typeof value.title === "string" ? value.title : DEMO_CAMPAIGN.title,
    description:
      typeof value.description === "string" ? value.description : DEMO_CAMPAIGN.description,
    isActive:
      typeof value.isActive === "boolean" ? value.isActive : DEMO_CAMPAIGN.isActive,
    stampName: typeof value.stampName === "string" ? value.stampName : DEMO_CAMPAIGN.stampName,
    littleWheelEntryEveryStamps:
      typeof value.littleWheelEntryEveryStamps === "number" &&
      Number.isFinite(value.littleWheelEntryEveryStamps)
        ? Math.max(1, value.littleWheelEntryEveryStamps)
        : DEMO_CAMPAIGN.littleWheelEntryEveryStamps,
    bigWheelEntryEveryStamps:
      typeof value.bigWheelEntryEveryStamps === "number" &&
      Number.isFinite(value.bigWheelEntryEveryStamps)
        ? Math.max(1, value.bigWheelEntryEveryStamps)
        : DEMO_CAMPAIGN.bigWheelEntryEveryStamps,
  };
}

function normaliseDemoQuest(value: unknown, fallback?: DemoQuest): DemoQuest | null {
  if (!isRecord(value)) return fallback ? { ...fallback } : null;
  const id = typeof value._id === "string" ? value._id : fallback?._id;
  const title = typeof value.title === "string" ? value.title : fallback?.title;
  const category = typeof value.category === "string" ? value.category : fallback?.category;
  const description =
    typeof value.description === "string" ? value.description : fallback?.description;
  const completionMethod =
    value.completionMethod === "auto" ||
    value.completionMethod === "manual" ||
    value.completionMethod === "admin"
      ? value.completionMethod
      : fallback?.completionMethod;
  const stampReward =
    typeof value.stampReward === "number" && Number.isFinite(value.stampReward)
      ? Math.max(1, value.stampReward)
      : fallback?.stampReward;
  const sortOrder =
    typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder)
      ? value.sortOrder
      : fallback?.sortOrder;
  const isActive = typeof value.isActive === "boolean" ? value.isActive : fallback?.isActive;

  if (!id || !title || !category || !description || !completionMethod || !stampReward || sortOrder === undefined || isActive === undefined) {
    return null;
  }

  return {
    _id: id,
    title,
    category: category as AdminCategory,
    description,
    evidenceInstructions:
      typeof value.evidenceInstructions === "string"
        ? value.evidenceInstructions
        : fallback?.evidenceInstructions,
    adminHint: typeof value.adminHint === "string" ? value.adminHint : fallback?.adminHint,
    completionMethod,
    evidenceInput:
      value.evidenceInput === "image" || value.evidenceInput === "link"
        ? value.evidenceInput
        : fallback?.evidenceInput,
    stampReward,
    sortOrder,
    isActive,
  };
}

export function loadDemoAdminConfig(): DemoAdminConfig {
  if (typeof window === "undefined") return getDefaultDemoAdminConfig();
  try {
    const raw = window.localStorage.getItem(DEMO_ADMIN_CONFIG_STORAGE_KEY);
    if (!raw) return getDefaultDemoAdminConfig();
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return getDefaultDemoAdminConfig();

    const fallbackQuests = new Map(DEMO_QUESTS.map((quest) => [quest._id, quest]));
    const parsedQuests = Array.isArray(parsed.quests)
      ? parsed.quests
          .map((quest) =>
            normaliseDemoQuest(
              quest,
              isRecord(quest) && typeof quest._id === "string"
                ? fallbackQuests.get(quest._id)
                : undefined,
            ),
          )
          .filter((quest): quest is DemoQuest => quest !== null)
      : cloneDemoQuests(DEMO_QUESTS);

    return {
      campaign: normaliseDemoCampaign(parsed.campaign),
      quests: parsedQuests.length > 0 ? parsedQuests : cloneDemoQuests(DEMO_QUESTS),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return getDefaultDemoAdminConfig();
  }
}

export function saveDemoAdminConfig(config: Omit<DemoAdminConfig, "updatedAt">): DemoAdminConfig {
  const next = {
    campaign: { ...config.campaign },
    quests: cloneDemoQuests(config.quests),
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(DEMO_ADMIN_CONFIG_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("summer-slam-admin-demo-config-updated"));
  return next;
}

export function resetDemoAdminConfig() {
  if (typeof window === "undefined") return getDefaultDemoAdminConfig();
  window.localStorage.removeItem(DEMO_ADMIN_CONFIG_STORAGE_KEY);
  window.dispatchEvent(new Event("summer-slam-admin-demo-config-updated"));
  return getDefaultDemoAdminConfig();
}

export function buildDemoQuestEntries(config: DemoAdminConfig, baseEntries: QuestEntry[]) {
  const progressByQuestId = new Map(baseEntries.map((entry) => [entry.quest._id as string, entry.progress]));
  return config.quests
    .filter((quest) => quest.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((quest) => ({
      quest: {
        _id: quest._id as QuestEntry["quest"]["_id"],
        title: quest.title,
        description: quest.description,
        category: quest.category,
        completionMethod: quest.completionMethod,
        evidenceInput: quest.evidenceInput,
        evidenceInstructions: quest.evidenceInstructions,
        adminHint: quest.adminHint,
        stampReward: quest.stampReward,
      },
      progress: progressByQuestId.get(quest._id) ?? null,
    }));
}

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
