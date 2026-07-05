import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import { isYuniteImport } from "./lib/importSource";

export type ExportPlayer = {
  discordIds: string[];
  discordUsername: string;
  epicUsername: string;
  status: "active" | "former";
};

export type ExportTierHistoryRecord = {
  discordIds: string[];
  previousTier?: string;
  newTier: string;
  date: string;
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
      });
    }
    return players;
  },
});

/** One paginated page of tier history for exported participants. */
export const scanTierHistoryPage = query({
  args: {
    cursor: v.union(v.string(), v.null()),
    participantIds: v.array(v.id("players")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    records: TierHistoryRow[];
    continueCursor: string;
    isDone: boolean;
  }> => {
    await requireAdmin(ctx);

    const participantIds = new Set(args.participantIds.map((id) => id as string));
    const page = await ctx.db
      .query("tierHistory")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor });

    const records: TierHistoryRow[] = [];
    for (const record of page.page) {
      if (!participantIds.has(record.playerId as string)) {
        continue;
      }
      records.push({
        playerId: record.playerId,
        ...(record.previousTier ? { previousTier: record.previousTier } : {}),
        newTier: record.tier,
        date: formatExportDate(record._creationTime),
      });
    }

    return {
      records,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
