import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { normalizeDiscordId } from "../lib/playerIdentity";
import { resolvePlayerByDiscordId } from "./playerDiscordId";
import {
  getManualScoreForPlayer,
  pickCanonicalManualScore,
} from "./manualScores";

export const FEMALE_EVALUATED_GENDER = 50;

export async function getEvaluationGenderForPlayer(
  ctx: QueryCtx,
  playerId: Id<"players">,
): Promise<number | undefined> {
  const score = await getManualScoreForPlayer(ctx, playerId);
  return score?.gender;
}

export async function getEvaluationGenderForApplication(
  ctx: QueryCtx,
  application: Pick<Doc<"applications">, "_id" | "playerId">,
): Promise<number | undefined> {
  const genders: number[] = [];

  if (application.playerId) {
    const playerGender = await getEvaluationGenderForPlayer(
      ctx,
      application.playerId,
    );
    if (typeof playerGender === "number") {
      genders.push(playerGender);
    }
  }

  const applicationScores = await ctx.db
    .query("manualScores")
    .withIndex("by_application", (q) =>
      q.eq("applicationId", application._id),
    )
    .collect();

  const applicationScore = pickCanonicalManualScore(applicationScores);
  if (typeof applicationScore?.gender === "number") {
    genders.push(applicationScore.gender);
  }

  if (genders.includes(FEMALE_EVALUATED_GENDER)) {
    return FEMALE_EVALUATED_GENDER;
  }

  return genders[0];
}

/**
 * Evaluation gender for a Discord user from member profile and/or applications.
 */
export async function getEvaluationGenderForDiscordId(
  ctx: QueryCtx,
  discordId: string,
): Promise<number | undefined> {
  const normalized = normalizeDiscordId(discordId);
  const genders: number[] = [];

  const playerMatch = await resolvePlayerByDiscordId(ctx, normalized);
  if (playerMatch) {
    const playerGender = await getEvaluationGenderForPlayer(
      ctx,
      playerMatch.player._id,
    );
    if (typeof playerGender === "number") {
      genders.push(playerGender);
    }
  }

  const applications = await ctx.db
    .query("applications")
    .withIndex("by_discord_id", (q) => q.eq("discordId", normalized))
    .collect();

  for (const application of applications) {
    const applicationGender = await getEvaluationGenderForApplication(
      ctx,
      application,
    );
    if (typeof applicationGender === "number") {
      genders.push(applicationGender);
    }
  }

  if (genders.includes(FEMALE_EVALUATED_GENDER)) {
    return FEMALE_EVALUATED_GENDER;
  }

  return genders[0];
}

export type FemaleEvaluatedDiscordMember = {
  discordUserId: string;
  discordUsername: string;
};

function hasRealDiscordId(
  discordUserId: string | undefined,
): discordUserId is string {
  return Boolean(
    discordUserId && !discordUserId.startsWith("placeholder_"),
  );
}

async function resolveDiscordFromScore(
  ctx: QueryCtx,
  score: Doc<"manualScores">,
): Promise<FemaleEvaluatedDiscordMember | null> {
  if (score.playerId) {
    const player = await ctx.db.get(score.playerId);
    if (!player || !hasRealDiscordId(player.discordUserId)) {
      return null;
    }

    return {
      discordUserId: player.discordUserId,
      discordUsername: player.discordUsername,
    };
  }

  if (score.applicationId) {
    const application = await ctx.db.get(score.applicationId);
    if (!application || !hasRealDiscordId(application.discordId)) {
      return null;
    }

    return {
      discordUserId: application.discordId,
      discordUsername: application.discordUsername,
    };
  }

  return null;
}

/**
 * All Discord IDs with a female evaluation (player or application manualScores).
 */
export async function listFemaleEvaluatedDiscordMembers(
  ctx: QueryCtx,
): Promise<FemaleEvaluatedDiscordMember[]> {
  const seen = new Set<string>();
  const members: FemaleEvaluatedDiscordMember[] = [];

  const scores = await ctx.db.query("manualScores").collect();

  for (const score of scores) {
    if (score.gender !== FEMALE_EVALUATED_GENDER) {
      continue;
    }

    const resolved = await resolveDiscordFromScore(ctx, score);
    if (!resolved || seen.has(resolved.discordUserId)) {
      continue;
    }

    seen.add(resolved.discordUserId);
    members.push(resolved);
  }

  return members;
}
