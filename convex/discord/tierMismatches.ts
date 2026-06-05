import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { filterVisibleMembers } from "../helpers/playerAlt";
import {
  getPlayerFemaleVerification,
  loadFemaleVerificationLookup,
} from "../helpers/femaleVerification";
import { getManualScoreForPlayer } from "../helpers/manualScores";
import { compareTiers } from "../helpers/tierSort";

// Tier role names expected in Discord
const TIER_ROLE_NAMES = ["Tier S", "Tier A", "Tier B", "Tier C", "Tier D"];

/** Yunite verified — required to surface "missing tier role" mismatches */
const YUNITE_VERIFIED_ROLE_ID = "1371623256855154818";

/** Woman verified — female-scored players need this before missing tier role is flagged */
const WOMAN_VERIFIED_ROLE_NAME = "Woman Verified";

function hasDiscordRole(
  roles: { id: string; name: string }[] | undefined,
  roleId: string,
): boolean {
  return (roles ?? []).some((role) => role.id === roleId);
}

function hasDiscordRoleNamed(
  roles: { id: string; name: string }[] | undefined,
  roleName: string,
): boolean {
  const normalized = roleName.toLowerCase();
  return (roles ?? []).some((role) => role.name.toLowerCase() === normalized);
}

function hasWomanVerifiedRole(
  roles: { id: string; name: string }[] | undefined,
): boolean {
  return hasDiscordRoleNamed(roles, WOMAN_VERIFIED_ROLE_NAME);
}

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

function hasGenderValue(gender: number | undefined | null): boolean {
  return gender === 50 || gender === 100;
}

async function getReviewablePlayers(ctx: QueryCtx): Promise<Doc<"players">[]> {
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

  const playerMap = new Map<string, Doc<"players">>();
  for (const p of [...activePlayers, ...acceptedMembers]) {
    playerMap.set(p._id, p);
  }

  return filterVisibleMembers(
    [...playerMap.values()].filter(
      (p) => p.status !== "archived" && p.status !== "rejected",
    ),
  );
}

async function requireAdminOrMod(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
    return null;
  }

  return user;
}

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
  missingGender: boolean;
  femaleVerified: boolean;
  sheetFemaleNotOnSite: boolean;
};

type MissingGenderPlayer = {
  playerId: string;
  discordUsername: string;
  discordUserId: string;
  epicUsername: string;
  nickname: string | undefined;
  tier: string | undefined;
  isFemale: boolean;
  femaleVerified: boolean;
  sheetFemaleNotOnSite: boolean;
};

/**
 * Returns all players whose website tier doesn't match their Discord tier role.
 * Uses cached discordRoles data (no live Discord API call needed).
 */
export const getTierMismatches = query({
  args: {},
  handler: async (ctx): Promise<TierMismatch[]> => {
    if (!(await requireAdminOrMod(ctx))) return [];

    const mismatches: TierMismatch[] = [];
    const femaleLookup = await loadFemaleVerificationLookup(ctx);

    for (const player of await getReviewablePlayers(ctx)) {
      // Skip players without a website tier
      if (!player.tier) continue;

      const discordTierRoles = (player.discordRoles ?? [])
        .filter((role) => TIER_ROLE_NAMES.includes(role.name))
        .map((role) => role.name.replace("Tier ", ""));

      let mismatchStatus: MismatchStatus | null = null;
      let score: Awaited<ReturnType<typeof getManualScoreForPlayer>> | null = null;

      if (discordTierRoles.length === 0) {
        if (hasDiscordRole(player.discordRoles, YUNITE_VERIFIED_ROLE_ID)) {
          score = await getManualScoreForPlayer(ctx, player._id);
          const isFemale = score?.gender === 50;
          const lacksWomanVerified =
            isFemale && !hasWomanVerifiedRole(player.discordRoles);
          if (!lacksWomanVerified) {
            mismatchStatus = "missing_role";
          }
        }
      } else if (discordTierRoles.length > 1) {
        mismatchStatus = "multiple_roles";
      } else if (discordTierRoles[0] !== player.tier) {
        mismatchStatus = "wrong_role";
      }

      if (mismatchStatus) {
        if (!score) {
          score = await getManualScoreForPlayer(ctx, player._id);
        }
        const isFemale = score?.gender === 50;
        const missingGender = !hasGenderValue(score?.gender);
        const { femaleVerified } = getPlayerFemaleVerification(player, femaleLookup);
        const sheetFemaleNotOnSite = femaleVerified && !isFemale;

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
          missingGender,
          femaleVerified,
          sheetFemaleNotOnSite,
        });
      }
    }

    const severityOrder: Record<MismatchStatus, number> = {
      wrong_role: 0,
      multiple_roles: 1,
      missing_role: 2,
    };
    mismatches.sort((a, b) => {
      const tierCmp = compareTiers(a.websiteTier, b.websiteTier);
      if (tierCmp !== 0) return tierCmp;
      const severityCmp =
        severityOrder[a.mismatchStatus] - severityOrder[b.mismatchStatus];
      if (severityCmp !== 0) return severityCmp;
      return (a.discordUsername ?? "").localeCompare(b.discordUsername ?? "");
    });

    return mismatches;
  },
});

/**
 * Returns active/accepted players whose evaluation has no gender set (not male or female).
 */
export const getPlayersMissingGender = query({
  args: {},
  handler: async (ctx): Promise<MissingGenderPlayer[]> => {
    if (!(await requireAdminOrMod(ctx))) return [];

    const missing: MissingGenderPlayer[] = [];
    const femaleLookup = await loadFemaleVerificationLookup(ctx);

    for (const player of await getReviewablePlayers(ctx)) {
      const score = await getManualScoreForPlayer(ctx, player._id);

      if (hasGenderValue(score?.gender)) continue;

      const isFemale = score?.gender === 50;
      const { femaleVerified } = getPlayerFemaleVerification(player, femaleLookup);

      missing.push({
        playerId: player._id,
        discordUsername: player.discordUsername,
        discordUserId: player.discordUserId,
        epicUsername: player.epicUsername,
        nickname: player.nickname,
        tier: player.tier,
        isFemale,
        femaleVerified,
        sheetFemaleNotOnSite: femaleVerified && !isFemale,
      });
    }

    missing.sort((a, b) =>
      (a.discordUsername ?? "").localeCompare(b.discordUsername ?? ""),
    );

    return missing;
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
  femaleVerified: boolean;
  sheetFemaleNotOnSite: boolean;
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
    if (!(await requireAdminOrMod(ctx))) return [];

    const allScores = await ctx.db.query("manualScores").collect();
    const incomplete: IncompleteEvaluation[] = [];
    const femaleLookup = await loadFemaleVerificationLookup(ctx);

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

      const isFemale = score.gender === 50;
      const { femaleVerified } = getPlayerFemaleVerification(player, femaleLookup);

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
        isFemale,
        femaleVerified,
        sheetFemaleNotOnSite: femaleVerified && !isFemale,
      });
    }

    // Sort by most missing fields first
    incomplete.sort((a, b) => b.missingFields.length - a.missingFields.length);

    return incomplete;
  },
});
