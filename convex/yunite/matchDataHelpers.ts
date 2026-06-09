import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import { findPlayerByDiscordUserId } from "../helpers/playerDiscordAliases";

const matchPlayerStatsRowValidator = v.object({
  sessionId: v.string(),
  playerId: v.id("players"),
  discordId: v.string(),
  teamId: v.optional(v.string()),
  duoDiscordId: v.optional(v.string()),
  placement: v.number(),
  eliminations: v.number(),
  knocks: v.number(),
  deaths: v.number(),
  teamTotalKills: v.number(),
  deathTime: v.optional(v.number()),
  duoDeathTime: v.optional(v.number()),
  killsAfterDuoDeath: v.optional(v.number()),
  timeAliveAfterDuoDeath: v.optional(v.number()),
});

type MatchPlayerStatsRow = {
  sessionId: string;
  playerId: Id<"players">;
  discordId: string;
  teamId?: string;
  duoDiscordId?: string;
  placement: number;
  eliminations: number;
  knocks: number;
  deaths: number;
  teamTotalKills: number;
  deathTime?: number;
  duoDeathTime?: number;
  killsAfterDuoDeath?: number;
  timeAliveAfterDuoDeath?: number;
};

function matchStatFieldsEqual(
  existing: Doc<"matchPlayerStats">,
  incoming: MatchPlayerStatsRow,
): boolean {
  return (
    existing.placement === incoming.placement &&
    existing.eliminations === incoming.eliminations &&
    existing.knocks === incoming.knocks &&
    existing.deaths === incoming.deaths &&
    existing.teamTotalKills === incoming.teamTotalKills &&
    (existing.teamId ?? undefined) === (incoming.teamId ?? undefined) &&
    (existing.duoDiscordId ?? undefined) === (incoming.duoDiscordId ?? undefined) &&
    (existing.deathTime ?? undefined) === (incoming.deathTime ?? undefined) &&
    (existing.duoDeathTime ?? undefined) === (incoming.duoDeathTime ?? undefined) &&
    (existing.killsAfterDuoDeath ?? undefined) ===
      (incoming.killsAfterDuoDeath ?? undefined) &&
    (existing.timeAliveAfterDuoDeath ?? undefined) ===
      (incoming.timeAliveAfterDuoDeath ?? undefined) &&
    existing.playerId === incoming.playerId
  );
}

function resultMatchFieldsEqual(
  existing: Pick<
    Doc<"thirdPartyResults">,
    "eliminations" | "deaths" | "wins" | "matchesPlayed"
  >,
  incoming: {
    eliminations: number;
    deaths: number;
    wins?: number;
    matchesPlayed?: number;
  },
): boolean {
  return (
    (existing.eliminations ?? 0) === incoming.eliminations &&
    (existing.deaths ?? 0) === incoming.deaths &&
    (existing.wins ?? 0) === (incoming.wins ?? 0) &&
    (existing.matchesPlayed ?? 0) === (incoming.matchesPlayed ?? 0)
  );
}

/** Import-scoped result rows with match-sync fields for in-memory lookup. */
export const getImportResultsForMatchSync = internalQuery({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();

    const resultRows: Array<{
      discordId: string;
      resultId: Id<"thirdPartyResults">;
      eliminations: number;
      deaths: number;
      wins: number;
      matchesPlayed: number;
    }> = [];

    for (const result of results) {
      if (!result.discordId) {
        continue;
      }
      resultRows.push({
        discordId: result.discordId,
        resultId: result._id,
        eliminations: result.eliminations ?? 0,
        deaths: result.deaths ?? 0,
        wins: result.wins ?? 0,
        matchesPlayed: result.matchesPlayed ?? 0,
      });
    }

    return { resultRows, totalResults: results.length };
  },
});

/** Indexed player resolution for a batch of Discord IDs. */
export const resolvePlayersByDiscordIds = internalQuery({
  args: { discordIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const playerRefs: Array<{ discordId: string; playerId: Id<"players"> }> = [];

    for (const discordId of args.discordIds) {
      const player = await findPlayerByDiscordUserId(ctx, discordId);
      if (player) {
        playerRefs.push({ discordId, playerId: player._id });
      }
    }

    return { playerRefs };
  },
});

export const bulkStoreMatchPlayerStats = internalMutation({
  args: {
    importId: v.id("thirdPartyImports"),
    rows: v.array(matchPlayerStatsRowValidator),
  },
  handler: async (ctx, args) => {
    const existingForImport = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();

    const existingBySessionDiscord = new Map<string, Doc<"matchPlayerStats">>();
    for (const row of existingForImport) {
      existingBySessionDiscord.set(`${row.sessionId}:${row.discordId}`, row);
    }

    let written = 0;
    let skippedNoChange = 0;
    const playersToFlag = new Set<Id<"players">>();
    const writtenPlayerIds = new Set<Id<"players">>();

    for (const row of args.rows) {
      const key = `${row.sessionId}:${row.discordId}`;
      const existing = existingBySessionDiscord.get(key);

      if (existing && matchStatFieldsEqual(existing, row)) {
        skippedNoChange += 1;
        continue;
      }

      if (existing) {
        await ctx.db.patch(existing._id, {
          teamId: row.teamId,
          duoDiscordId: row.duoDiscordId,
          placement: row.placement,
          eliminations: row.eliminations,
          knocks: row.knocks,
          deaths: row.deaths,
          teamTotalKills: row.teamTotalKills,
          deathTime: row.deathTime,
          duoDeathTime: row.duoDeathTime,
          killsAfterDuoDeath: row.killsAfterDuoDeath,
          timeAliveAfterDuoDeath: row.timeAliveAfterDuoDeath,
          playerId: row.playerId,
        });
      } else {
        const id = await ctx.db.insert("matchPlayerStats", {
          importId: args.importId,
          sessionId: row.sessionId,
          playerId: row.playerId,
          discordId: row.discordId,
          teamId: row.teamId,
          duoDiscordId: row.duoDiscordId,
          placement: row.placement,
          eliminations: row.eliminations,
          knocks: row.knocks,
          deaths: row.deaths,
          teamTotalKills: row.teamTotalKills,
          deathTime: row.deathTime,
          duoDeathTime: row.duoDeathTime,
          killsAfterDuoDeath: row.killsAfterDuoDeath,
          timeAliveAfterDuoDeath: row.timeAliveAfterDuoDeath,
        });
        existingBySessionDiscord.set(key, {
          _id: id,
          _creationTime: Date.now(),
          importId: args.importId,
          ...row,
        } as Doc<"matchPlayerStats">);
      }

      playersToFlag.add(row.playerId);
      writtenPlayerIds.add(row.playerId);
      written += 1;
    }

    for (const playerId of playersToFlag) {
      await ctx.db.patch(playerId, { hasMatchData: true });
    }

    return { written, skippedNoChange, writtenPlayerIds: [...writtenPlayerIds] };
  },
});

export const bulkUpdateResultWithMatchData = internalMutation({
  args: {
    updates: v.array(
      v.object({
        resultId: v.id("thirdPartyResults"),
        eliminations: v.number(),
        deaths: v.number(),
        wins: v.optional(v.number()),
        matchesPlayed: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let updated = 0;
    let skippedNoChange = 0;

    for (const update of args.updates) {
      const existing = await ctx.db.get(update.resultId);
      if (!existing) {
        continue;
      }

      if (resultMatchFieldsEqual(existing, update)) {
        skippedNoChange += 1;
        continue;
      }

      await ctx.db.patch(update.resultId, {
        eliminations: update.eliminations,
        deaths: update.deaths,
        wins: update.wins,
        matchesPlayed: update.matchesPlayed,
      });
      updated += 1;
    }

    return { updated, skippedNoChange };
  },
});
