import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireModeratorOrAdmin } from "./auth_helpers";
import {
  mapTtExportPlayerToAssessmentInput,
  type TtReviewMetricsExportPlayer,
} from "./lib/stats/tierReviewConfidence";

const exportPlayerValidator = v.object({
  playerId: v.string(),
  slug: v.optional(v.string()),
  discordUsername: v.string(),
  epicUsername: v.optional(v.string()),
  currentTier: v.string(),
  evaluationTotalScore: v.optional(v.union(v.number(), v.null())),
  experienceScore: v.optional(v.union(v.number(), v.null())),
  reviewAssessment: v.optional(v.any()),
});

function pillarAlignment(
  row: TtReviewMetricsExportPlayer,
  key: "skillRating" | "competitiveRating" | "carry" | "skillTrend" | "formTrend",
) {
  const alignment = row.reviewAssessment?.pillars?.[key]?.alignment;
  if (
    alignment === "supports" ||
    alignment === "neutral" ||
    alignment === "challenges"
  ) {
    return alignment;
  }
  return undefined;
}

async function resolvePlayerId(
  ctx: { db: { get: (id: Id<"players">) => Promise<unknown> } },
  row: TtReviewMetricsExportPlayer,
): Promise<Id<"players"> | null> {
  try {
    const candidate = row.playerId as Id<"players">;
    const player = await ctx.db.get(candidate);
    if (player) return candidate;
  } catch {
    // Invalid id format — fall through to username lookup.
  }
  return null;
}

export const getTtReviewMetricsImportStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireModeratorOrAdmin(ctx);

    const [meta] = await ctx.db.query("ttReviewMetricsImport").take(1);
    if (!meta) {
      return { active: false as const };
    }

    return {
      active: true as const,
      contract: meta.contract,
      schemaVersion: meta.schemaVersion,
      generatedAt: meta.generatedAt,
      importedAt: meta.importedAt,
      playerCount: meta.playerCount,
    };
  },
});

export const importTtReviewMetrics = mutation({
  args: {
    contract: v.string(),
    schemaVersion: v.string(),
    generatedAt: v.string(),
    playerCount: v.number(),
    players: v.array(exportPlayerValidator),
  },
  handler: async (ctx, args) => {
    await requireModeratorOrAdmin(ctx);

    if (args.contract !== "zbd.tt.reviewMetrics") {
      throw new Error(
        `Unsupported contract "${args.contract}" — expected zbd.tt.reviewMetrics`,
      );
    }

    if (!args.players.length) {
      throw new Error("Import payload contains no players.");
    }

    const discordIndex = new Map<string, Id<"players">>();
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    for (const player of activePlayers) {
      discordIndex.set(player.discordUsername.toLowerCase(), player._id);
    }

    const existingMeta = await ctx.db.query("ttReviewMetricsImport").collect();
    for (const row of existingMeta) {
      await ctx.db.delete(row._id);
    }
    const existingRows = await ctx.db.query("ttReviewMetricsByPlayer").collect();
    for (const row of existingRows) {
      await ctx.db.delete(row._id);
    }

    const importedAt = Date.now();
    let matched = 0;
    let skipped = 0;

    for (const row of args.players as TtReviewMetricsExportPlayer[]) {
      let playerId = await resolvePlayerId(ctx, row);
      if (!playerId) {
        playerId =
          discordIndex.get(row.discordUsername.toLowerCase()) ?? null;
      }
      if (!playerId) {
        skipped += 1;
        continue;
      }

      const assessment = mapTtExportPlayerToAssessmentInput(row);

      await ctx.db.insert("ttReviewMetricsByPlayer", {
        playerId,
        slug: row.slug,
        discordUsername: row.discordUsername,
        epicUsername: row.epicUsername,
        currentTier: row.currentTier,
        evaluationTotalScore:
          typeof row.evaluationTotalScore === "number"
            ? row.evaluationTotalScore
            : undefined,
        eligible: assessment.eligible,
        conclusion: assessment.conclusion ?? undefined,
        decisionConfidence: assessment.decisionConfidence,
        adminAction: assessment.adminAction,
        directionHint: assessment.directionHint ?? undefined,
        experienceScore: assessment.experienceScore,
        formTrendLevel: assessment.formTrendLevel,
        pillarSkillRating: pillarAlignment(row, "skillRating"),
        pillarCompetitiveRating: pillarAlignment(row, "competitiveRating"),
        pillarCarry: pillarAlignment(row, "carry"),
        pillarSkillTrend: pillarAlignment(row, "skillTrend"),
        pillarFormTrend: pillarAlignment(row, "formTrend"),
        snapshotGeneratedAt: args.generatedAt,
        importedAt,
      });
      matched += 1;
    }

    await ctx.db.insert("ttReviewMetricsImport", {
      contract: args.contract,
      schemaVersion: args.schemaVersion,
      generatedAt: args.generatedAt,
      importedAt,
      playerCount: matched,
    });

    return {
      matched,
      skipped,
      importedAt,
      generatedAt: args.generatedAt,
    };
  },
});
