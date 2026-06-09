import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { FEMALE_EVALUATED_GENDER } from "./evaluationGender";
import { pickCanonicalManualScore } from "./manualScores";

export type GenderSheetStatus = "active" | "former" | "application";

export type GenderSheetEntry = {
  discordUserId: string;
  discordUsername: string;
  gender: number;
  status: GenderSheetStatus;
};

function hasRealDiscordId(
  discordUserId: string | undefined,
): discordUserId is string {
  return Boolean(
    discordUserId && !discordUserId.startsWith("placeholder_"),
  );
}

function membershipToSheetStatus(
  membership: Doc<"players">["currentMembershipStatus"],
): GenderSheetStatus | null {
  if (membership === "accepted") {
    return "active";
  }

  if (membership === "former") {
    return "former";
  }

  return null;
}

/**
 * Eligible rows for Mod Log "Gender Sheet": gender = 50, active / former / pending application.
 */
export async function listGenderSheetEntries(
  ctx: QueryCtx,
): Promise<GenderSheetEntry[]> {
  const byDiscordId = new Map<string, GenderSheetEntry>();

  const scores = await ctx.db
    .query("manualScores")
    .withIndex("by_gender", (q) => q.eq("gender", FEMALE_EVALUATED_GENDER))
    .collect();

  for (const score of scores) {
    if (score.gender !== FEMALE_EVALUATED_GENDER) {
      continue;
    }

    if (score.playerId) {
      const player = await ctx.db.get(score.playerId);

      if (!player || !hasRealDiscordId(player.discordUserId)) {
        continue;
      }

      const status = membershipToSheetStatus(player.currentMembershipStatus);

      if (!status) {
        continue;
      }

      byDiscordId.set(player.discordUserId, {
        discordUserId: player.discordUserId,
        discordUsername: player.discordUsername,
        gender: FEMALE_EVALUATED_GENDER,
        status,
      });
      continue;
    }

    if (score.applicationId) {
      const application = await ctx.db.get(score.applicationId);

      if (
        !application ||
        application.status !== "pending" ||
        !hasRealDiscordId(application.discordId)
      ) {
        continue;
      }

      if (!byDiscordId.has(application.discordId)) {
        byDiscordId.set(application.discordId, {
          discordUserId: application.discordId,
          discordUsername: application.discordUsername,
          gender: FEMALE_EVALUATED_GENDER,
          status: "application",
        });
      }
    }
  }

  const pendingApplications = await ctx.db
    .query("applications")
    .withIndex("by_status", (q) => q.eq("status", "pending"))
    .collect();

  for (const application of pendingApplications) {
    if (!hasRealDiscordId(application.discordId)) {
      continue;
    }

    if (byDiscordId.has(application.discordId)) {
      continue;
    }

    const applicationScores = await ctx.db
      .query("manualScores")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", application._id),
      )
      .collect();

    const applicationScore = pickCanonicalManualScore(applicationScores);

    if (applicationScore?.gender !== FEMALE_EVALUATED_GENDER) {
      continue;
    }

    byDiscordId.set(application.discordId, {
      discordUserId: application.discordId,
      discordUsername: application.discordUsername,
      gender: FEMALE_EVALUATED_GENDER,
      status: "application",
    });
  }

  return [...byDiscordId.values()].sort((a, b) =>
    a.discordUsername.localeCompare(b.discordUsername),
  );
}
