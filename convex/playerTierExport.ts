import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import { isYuniteImport } from "./lib/importSource";

export type ExportPlayerTierChange = {
  previousTier?: string;
  newTier: string;
  date: string;
};

export type ExportPlayer = {
  discordIds: string[];
  discordUsername: string;
  epicUsername: string;
  status: "active" | "former";
  currentTier?: string;
  tierHistory: ExportPlayerTierChange[];
};

type TierHistoryRow = {
  playerId: Id<"players">;
  previousTier?: string;
  newTier: string;
  date: string;
};

const PAGE_SIZE = 2000;

function collectStoredDiscordIds(player: Doc<"players">): string[] {
  const ids: string[] = [];
  if (player.discordUserId) {
    ids.push(player.discordUserId);
  }
  for (const alternateId of player.alternateDiscordUserIds ?? []) {
    if (alternateId && !ids.includes(alternateId)) {
      ids.push(alternateId);
    }
  }
  return ids;
}

function mapExportStatus(player: Doc<"players">): "active" | "former" {
  if (player.currentMembershipStatus === "accepted") {
    return "active";
  }
  return "former";
}

function formatExportDate(creationTime: number): string {
  return new Date(creationTime).toISOString().slice(0, 10);
}

/** Yunite import IDs used to identify ZBD third-party results. */
export const getYuniteImportIds = query({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    await requireAdmin(ctx);

    const imports = await ctx.db.query("thirdPartyImports").collect();
    return imports
      .filter(isYuniteImport)
      .map((importRecord) => importRecord._id as string);
  },
});

/** One paginated page of manual event result player IDs. */
export const scanEventResultsPage = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    playerIds: Id<"players">[];
    continueCursor: string;
    isDone: boolean;
  }> => {
    await requireAdmin(ctx);

    const page = await ctx.db
      .query("eventResults")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor });

    const seen = new Set<string>();
    const playerIds: Id<"players">[] = [];
    for (const result of page.page) {
      const key = result.playerId as string;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      playerIds.push(result.playerId);
    }

    return {
      playerIds,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** One paginated page of Yunite-linked third-party result player IDs. */
export const scanThirdPartyResultsPage = query({
  args: {
    cursor: v.union(v.string(), v.null()),
    yuniteImportIds: v.array(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    playerIds: Id<"players">[];
    continueCursor: string;
    isDone: boolean;
  }> => {
    await requireAdmin(ctx);

    const yuniteImportIds = new Set(args.yuniteImportIds);
    const page = await ctx.db
      .query("thirdPartyResults")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor });

    const seen = new Set<string>();
    const playerIds: Id<"players">[] = [];
    for (const result of page.page) {
      if (
        !result.playerId ||
        !yuniteImportIds.has(result.importId as string)
      ) {
        continue;
      }
      const key = result.playerId as string;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      playerIds.push(result.playerId);
    }

    return {
      playerIds,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Player export rows for a batch of participant IDs. */
export const getPlayersExportBatch = query({
  args: { playerIds: v.array(v.id("players")) },
  handler: async (
    ctx,
    args,
  ): Promise<Array<ExportPlayer & { playerId: Id<"players"> }>> => {
    await requireAdmin(ctx);

    const players: Array<ExportPlayer & { playerId: Id<"players"> }> = [];
    for (const playerId of args.playerIds) {
      const player = await ctx.db.get(playerId);
      if (!player) {
        continue;
      }
      players.push({
        playerId,
        discordIds: collectStoredDiscordIds(player),
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
        status: mapExportStatus(player),
        ...(player.tier ? { currentTier: player.tier } : {}),
        tierHistory: [],
      });
    }
    return players;
  },
});

/** Tier history rows for a batch of participant IDs. */
export const getTierHistoryBatch = query({
  args: { playerIds: v.array(v.id("players")) },
  handler: async (ctx, args): Promise<TierHistoryRow[]> => {
    await requireAdmin(ctx);

    const records: TierHistoryRow[] = [];
    for (const playerId of args.playerIds) {
      const history = await ctx.db
        .query("tierHistory")
        .withIndex("by_player", (q) => q.eq("playerId", playerId))
        .collect();
      for (const record of history) {
        records.push({
          playerId,
          ...(record.previousTier ? { previousTier: record.previousTier } : {}),
          newTier: record.tier,
          date: formatExportDate(record._creationTime),
        });
      }
    }

    records.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return (a.playerId as string).localeCompare(b.playerId as string);
    });

    return records;
  },
});
