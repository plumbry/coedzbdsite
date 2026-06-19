import type { Id } from "@/convex/_generated/dataModel.d.ts";
import type { QuestEntry } from "./passport-types.ts";

const q = (id: string) => id as Id<"seasonalQuests">;

const day = (daysAgo: number) => Date.now() - daysAgo * 86_400_000;

export const MOCK_PLAYER = {
  discordUsername: "PlumBry",
  epicUsername: "PlumBry_FN",
};

export const MOCK_CAMPAIGN = {
  title: "Summer Slam Passport",
  stampName: "Passport Stamp",
  littleWheelEntryEveryStamps: 1,
  bigWheelEntryEveryStamps: 5,
  startsAt: day(18),
  endsAt: Date.now() + 23 * 86_400_000,
};

/**
 * Sample passport for admin preview — four seals earned, Community in progress
 * as the next destination, covering earned / awaiting-review / needs-fix / to-do.
 */
export const MOCK_QUEST_ENTRIES: QuestEntry[] = [
  // Traveller — EARNED
  {
    quest: {
      _id: q("mock_traveller_1"),
      title: "First Flight",
      description: "Play your first Summer Slam tagged event.",
      category: "traveller",
      completionMethod: "auto",
      stampReward: 1,
    },
    progress: {
      status: "approved",
      progressCurrent: 1,
      progressTarget: 1,
      awardSource: "auto",
      awardLog: "Auto-approved: Played 1 campaign event.",
      approvedAt: day(16),
    },
  },
  {
    quest: {
      _id: q("mock_traveller_2"),
      title: "Road Trip Regular",
      description: "Play 5 different Summer Slam events.",
      category: "traveller",
      completionMethod: "auto",
      stampReward: 1,
    },
    progress: {
      status: "approved",
      progressCurrent: 5,
      progressTarget: 5,
      awardSource: "auto",
      awardLog: "Auto-approved: Played 5 campaign events.",
      approvedAt: day(14),
    },
  },
  {
    quest: {
      _id: q("mock_traveller_3"),
      title: "Format Explorer",
      description: "Play Duos, Trios, and Squads Summer Slam events.",
      category: "traveller",
      completionMethod: "auto",
      adminHint: "Play:\n• Reload\n• OG\n• Zero Build\n\nYou do not need to win.",
      stampReward: 1,
    },
    progress: {
      status: "approved",
      progressCurrent: 3,
      progressTarget: 3,
      awardSource: "auto",
      awardLog: "Auto-approved: Played Duos, Trios and Squads.",
      approvedAt: day(13),
    },
  },
  // Competitor — EARNED
  {
    quest: {
      _id: q("mock_competitor_1"),
      title: "Top 10 Finish",
      description: "Reach Top 10 in a Summer Slam Trios event.",
      category: "competitor",
      completionMethod: "manual",
      evidenceInstructions: "Submit a Yunite match link or screenshot of your final placement.",
      stampReward: 1,
    },
    progress: {
      status: "approved",
      progressCurrent: 1,
      progressTarget: 1,
      awardSource: "manual_review",
      awardLog: "Approved by Staff.",
      approvedAt: day(11),
    },
  },
  {
    quest: {
      _id: q("mock_competitor_2"),
      title: "Victory Royale",
      description: "Win a game in a tagged Summer Slam event.",
      category: "competitor",
      completionMethod: "auto",
      stampReward: 1,
    },
    progress: {
      status: "approved",
      progressCurrent: 1,
      progressTarget: 1,
      awardSource: "auto",
      awardLog: "Auto-approved: Won a game in a campaign trios event.",
      approvedAt: day(9),
    },
  },
  // Summer Spirit — EARNED
  {
    quest: {
      _id: q("mock_spirit_1"),
      title: "Sunshine Selfie",
      description: "Share a Summer Slam moment on social media.",
      category: "summer_spirit",
      completionMethod: "manual",
      evidenceInstructions: "Paste a link to your post on X, Instagram, or TikTok.",
      adminHint: "Any Summer Slam screenshot counts:\n• wins\n• funny moments\n• team photos",
      stampReward: 1,
    },
    progress: {
      status: "approved",
      progressCurrent: 1,
      progressTarget: 1,
      awardSource: "manual_review",
      awardLog: "Approved by Staff.",
      approvedAt: day(8),
    },
  },
  {
    quest: {
      _id: q("mock_spirit_2"),
      title: "Beach Vibes Clip",
      description: "Submit a clip showing good vibes at a Summer Slam event.",
      category: "summer_spirit",
      completionMethod: "manual",
      evidenceInstructions: "Upload your clip to Discord, Medal, YouTube, or Twitch and paste the link.",
      stampReward: 1,
    },
    progress: {
      status: "approved",
      progressCurrent: 1,
      progressTarget: 1,
      awardSource: "manual_review",
      awardLog: "Approved by Staff.",
      approvedAt: day(6),
    },
  },
  // Team Player — EARNED
  {
    quest: {
      _id: q("mock_team_1"),
      title: "Squad Up",
      description: "Play a Squads Summer Slam event with your team.",
      category: "team_player",
      completionMethod: "auto",
      stampReward: 1,
    },
    progress: {
      status: "approved",
      progressCurrent: 1,
      progressTarget: 1,
      awardSource: "auto",
      awardLog: "Auto-approved: Played a campaign squads event.",
      approvedAt: day(7),
    },
  },
  {
    quest: {
      _id: q("mock_team_2"),
      title: "Assist King",
      description: "Get 10 eliminations across Summer Slam events as a duo.",
      category: "team_player",
      completionMethod: "manual",
      evidenceInstructions: "Submit a screenshot or clip link showing your eliminations.",
      stampReward: 1,
    },
    progress: {
      status: "approved",
      progressCurrent: 1,
      progressTarget: 1,
      awardSource: "manual_review",
      awardLog: "Approved by Staff.",
      approvedAt: day(4),
    },
  },
  // Community — NEXT DESTINATION (in progress)
  {
    quest: {
      _id: q("mock_community_1"),
      title: "Discord Champion",
      description: "Participate in the Summer Slam community night.",
      category: "community",
      completionMethod: "admin",
      stampReward: 1,
    },
    progress: {
      status: "approved",
      progressCurrent: 1,
      progressTarget: 1,
      awardSource: "admin",
      awardLog: "Awarded by Staff.",
      approvedAt: day(2),
    },
  },
  {
    quest: {
      _id: q("mock_community_2"),
      title: "Community Screenshot",
      description: "Submit a screenshot from a Summer Slam community event.",
      category: "community",
      completionMethod: "manual",
      evidenceInstructions: "Upload a screenshot showing you at a community event.",
      stampReward: 1,
    },
    progress: {
      status: "pending_review",
      progressCurrent: 1,
      progressTarget: 1,
      updatedAt: day(2),
    },
  },
  {
    quest: {
      _id: q("mock_community_3"),
      title: "Welcome Wagon",
      description: "Help a new player in Discord during Summer Slam week.",
      category: "community",
      completionMethod: "manual",
      evidenceInstructions: "Paste a Discord message link or screenshot showing you helping a new player.",
      stampReward: 1,
    },
    progress: {
      status: "needs_more_evidence",
      progressCurrent: 1,
      progressTarget: 1,
      awardLog: "Please include a clearer screenshot of the Discord conversation.",
      updatedAt: day(1),
    },
  },
];

export function computeMockTotals(entries: QuestEntry[]) {
  const approvedStamps = entries
    .filter((entry) => entry.progress?.status === "approved")
    .reduce((sum, entry) => sum + entry.quest.stampReward, 0);
  const totalStamps = entries.reduce((sum, entry) => sum + entry.quest.stampReward, 0);

  return {
    approvedStamps,
    totalStamps,
    littleWheelEntries: Math.floor(approvedStamps / MOCK_CAMPAIGN.littleWheelEntryEveryStamps),
    bigWheelEntries: Math.floor(approvedStamps / MOCK_CAMPAIGN.bigWheelEntryEveryStamps),
  };
}
