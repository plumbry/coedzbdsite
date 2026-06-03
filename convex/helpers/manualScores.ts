import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

const EVALUATION_FIELDS = [
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

function countEvaluationFields(score: Doc<"manualScores">): number {
  return EVALUATION_FIELDS.filter((field) => score[field] !== undefined && score[field] !== null)
    .length;
}

/** Prefer the record with the most filled fields; tie-break on newest. */
export function pickCanonicalManualScore(
  scores: Doc<"manualScores">[],
): Doc<"manualScores"> | null {
  if (scores.length === 0) return null;
  if (scores.length === 1) return scores[0];

  return scores.reduce((best, current) => {
    const bestCount = countEvaluationFields(best);
    const currentCount = countEvaluationFields(current);
    if (currentCount !== bestCount) {
      return currentCount > bestCount ? current : best;
    }
    return current._creationTime > best._creationTime ? current : best;
  });
}

export async function getManualScoreForPlayer(
  ctx: QueryCtx,
  playerId: Id<"players">,
): Promise<Doc<"manualScores"> | null> {
  const scores = await ctx.db
    .query("manualScores")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();

  return pickCanonicalManualScore(scores);
}
