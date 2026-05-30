import { query } from "../_generated/server";

// Tier role names expected in Discord
const TIER_ROLE_NAMES = ["Tier S", "Tier A", "Tier B", "Tier C", "Tier D"];

// All score fields that should be filled in a complete evaluation
const SCORE_FIELDS = [
  "thirdPartyExperience",
  "thirdPartyPerformance",
  "inGameTourneyPerformance",
  "officialEarnings",
  "rankedPerformance",
  "hoursPlayed",
  "notorietyTeammates",
  "age",
  "gender",
  "ability",
  "region",
  "gameSense",
  "seasonPerformance",
  "modifiers",
] as const;

type MismatchStatus = "missing_role" | "wrong_role" | "multiple_roles";

type TierMismatch = {
  playerId: string;
  discordUsername: string;
  discordUserId: string;
  epicUsername: string;
  nickname: string | undefined;
  websiteTier: string;
  discordTiers: string[];
  mismatchStatus: MismatchStatus;
  currentMembershipStatus: string | undefined;
  status: string | undefined;
  isFemale: boolean;
};

/**
 * Returns all players whose website tier doesn't match their Discord tier role.
 * Uses cached discordRoles data (no live Discord API call needed).
 */
export const getTierMismatches = query({
  args: {},
  handler: async (ctx): Promise<TierMismatch[]> => {
    // Check auth - admin or moderator only
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return [];
    }

    // Get all active/accepted players with a tier
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const acceptedMembers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) =>
        q.eq("currentMembershipStatus", "accepted"),
      )
      .collect();

    // Combine and deduplicate
    const playerMap = new Map<string, (typeof activePlayers)[0]>();
    for (const p of [...activePlayers, ...acceptedMembers]) {
      playerMap.set(p._id, p);
    }

    const mismatches: TierMismatch[] = [];

    for (const player of playerMap.values()) {
      // Skip players without a website tier
      if (!player.tier) continue;
      // Skip archived/rejected
      if (player.status === "archived" || player.status === "rejected") continue;

      const discordTierRoles = (player.discordRoles ?? [])
        .filter((role) => TIER_ROLE_NAMES.includes(role.name))
        .map((role) => role.name.replace("Tier ", ""));

      let mismatchStatus: MismatchStatus | null = null;

      if (discordTierRoles.length === 0) {
        mismatchStatus = "missing_role";
      } else if (discordTierRoles.length > 1) {
        mismatchStatus = "multiple_roles";
      } else if (discordTierRoles[0] !== player.tier) {
        mismatchStatus = "wrong_role";
      }

      if (mismatchStatus) {
        // Look up manualScore to determine if player is female (gender = 50)
        const score = await ctx.db
          .query("manualScores")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .first();
        const isFemale = score?.gender === 50;

        mismatches.push({
          playerId: player._id,
          discordUsername: player.discordUsername,
          discordUserId: player.discordUserId,
          epicUsername: player.epicUsername,
          nickname: player.nickname,
          websiteTier: player.tier,
          discordTiers: discordTierRoles,
          mismatchStatus,
          currentMembershipStatus: player.currentMembershipStatus,
          status: player.status,
          isFemale,
        });
      }
    }

    // Sort by mismatch severity: wrong_role first, then multiple, then missing
    const severityOrder: Record<MismatchStatus, number> = {
      wrong_role: 0,
      multiple_roles: 1,
      missing_role: 2,
    };
    mismatches.sort(
      (a, b) =>
        severityOrder[a.mismatchStatus] - severityOrder[b.mismatchStatus],
    );

    return mismatches;
  },
});

type IncompleteEvaluation = {
  playerId: string;
  discordUsername: string;
  discordUserId: string;
  epicUsername: string;
  nickname: string | undefined;
  tier: string;
  totalScore: number;
  missingFields: string[];
  filledCount: number;
  totalFields: number;
  isFemale: boolean;
};

// Human-readable labels for score fields
const FIELD_LABELS: Record<string, string> = {
  thirdPartyExperience: "3rd Party Exp",
  thirdPartyPerformance: "3rd Party Perf",
  inGameTourneyPerformance: "In-Game Tourney",
  officialEarnings: "Official Earnings",
  rankedPerformance: "Ranked Perf",
  hoursPlayed: "Hours Played",
  notorietyTeammates: "Notoriety/Teammates",
  age: "Age",
  gender: "Gender",
  ability: "Ability",
  region: "Region",
  gameSense: "Game Sense",
  seasonPerformance: "Season Perf",
  modifiers: "Modifiers",
};

/**
 * Returns all players who have an evaluation but are missing one or more score fields.
 */
export const getIncompleteEvaluations = query({
  args: {},
  handler: async (ctx): Promise<IncompleteEvaluation[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return [];
    }

    const allScores = await ctx.db.query("manualScores").collect();
    const incomplete: IncompleteEvaluation[] = [];

    for (const score of allScores) {
      const missingFields: string[] = [];
      for (const field of SCORE_FIELDS) {
        const val = score[field];
        if (val === undefined || val === null) {
          missingFields.push(FIELD_LABELS[field] ?? field);
        }
      }

      if (missingFields.length === 0) continue;

      const player = await ctx.db.get(score.playerId);
      if (!player) continue;
      // Skip archived/rejected
      if (player.status === "archived" || player.status === "rejected") continue;

      incomplete.push({
        playerId: player._id,
        discordUsername: player.discordUsername,
        discordUserId: player.discordUserId,
        epicUsername: player.epicUsername,
        nickname: player.nickname,
        tier: score.tier,
        totalScore: score.totalScore,
        missingFields,
        filledCount: SCORE_FIELDS.length - missingFields.length,
        totalFields: SCORE_FIELDS.length,
        isFemale: score.gender === 50,
      });
    }

    // Sort by most missing fields first
    incomplete.sort((a, b) => b.missingFields.length - a.missingFields.length);

    return incomplete;
  },
});
