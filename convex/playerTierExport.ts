import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdminAction } from "./auth_helpers";
import { isYuniteImport } from "./lib/importSource";

type ExportPlayer = {
  discordIds: string[];
  discordUsername: string;
  epicUsername: string;
  status: "active" | "former";
};

type ExportTierHistoryRecord = {
  discordIds: string[];
  previousTier?: string;
  newTier: string;
  date: string;
};

type PlayerExportRow = {
  playerId: Id<"players">;
  discordIds: string[];
  discordUsername: string;
  epicUsername: string;
  status: "active" | "former";
};

type TierHistoryExportRow = {
  playerId: Id<"players">;
  previousTier?: string;
  newTier: string;
  date: string;
};

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

function mergeParticipantIds(
  ...lists: Array<Array<Id<"players">>>
): Id<"players">[] {
  const seen = new Set<string>();
  const merged: Id<"players">[] = [];
  for (const list of lists) {
    for (const playerId of list) {
      const key = playerId as string;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(playerId);
    }
  }
  return merged;
}

export const listYuniteImportIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const imports = await ctx.db.query("thirdPartyImports").collect();
    return imports
      .filter(isYuniteImport)
      .map((importRecord) => importRecord._id as string);
  },
});

export const listEventResultPlayerIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"players">[]> => {
    const participantIds: Id<"players">[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    let done = false;

    while (!done) {
      const page = await ctx.db
        .query("eventResults")
        .paginate({ numItems: 2000, cursor });
      for (const result of page.page) {
        const key = result.playerId as string;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        participantIds.push(result.playerId);
      }
      done = page.isDone;
      cursor = page.continueCursor;
    }

    return participantIds;
  },
});

export const listThirdPartyZbdPlayerIds = internalQuery({
  args: { yuniteImportIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<Id<"players">[]> => {
    const yuniteImportIds = new Set(args.yuniteImportIds);
    const participantIds: Id<"players">[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    let done = false;

    while (!done) {
      const page = await ctx.db
        .query("thirdPartyResults")
        .paginate({ numItems: 2000, cursor });
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
        participantIds.push(result.playerId);
      }
      done = page.isDone;
      cursor = page.continueCursor;
    }

    return participantIds;
  },
});

export const buildPlayerExportRows = internalQuery({
  args: { participantIds: v.array(v.id("players")) },
  handler: async (ctx, args): Promise<PlayerExportRow[]> => {
    const rows: PlayerExportRow[] = [];
    for (const playerId of args.participantIds) {
      const player = await ctx.db.get(playerId);
      if (!player) {
        continue;
      }
      rows.push({
        playerId,
        discordIds: collectStoredDiscordIds(player),
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
        status: mapExportStatus(player),
      });
    }
    return rows;
  },
});

export const listTierHistoryForPlayers = internalQuery({
  args: { participantIds: v.array(v.id("players")) },
  handler: async (ctx, args): Promise<TierHistoryExportRow[]> => {
    const rows: TierHistoryExportRow[] = [];
    for (const playerId of args.participantIds) {
      const records = await ctx.db
        .query("tierHistory")
        .withIndex("by_player", (q) => q.eq("playerId", playerId))
        .collect();
      for (const record of records) {
        rows.push({
          playerId,
          ...(record.previousTier ? { previousTier: record.previousTier } : {}),
          newTier: record.tier,
          date: formatExportDate(record._creationTime),
        });
      }
    }
    return rows;
  },
});

export const exportPlayersAndTierHistory = action({
  args: {},
  handler: async (ctx): Promise<{
    players: ExportPlayer[];
    tierHistory: ExportTierHistoryRecord[];
  }> => {
    await requireAdminAction(ctx);

    const yuniteImportIds = await ctx.runQuery(
      internal.playerTierExport.listYuniteImportIds,
      {},
    );
    const eventParticipantIds = await ctx.runQuery(
      internal.playerTierExport.listEventResultPlayerIds,
      {},
    );
    const thirdPartyParticipantIds = await ctx.runQuery(
      internal.playerTierExport.listThirdPartyZbdPlayerIds,
      { yuniteImportIds },
    );
    const participantIds = mergeParticipantIds(
      eventParticipantIds,
      thirdPartyParticipantIds,
    );

    const playerRows = await ctx.runQuery(
      internal.playerTierExport.buildPlayerExportRows,
      { participantIds },
    );
    const discordIdsByPlayerId = new Map<Id<"players">, string[]>(
      playerRows
        .filter((row) => row.discordIds.length > 0)
        .map((row) => [row.playerId, row.discordIds]),
    );

    const players: ExportPlayer[] = playerRows
      .map(({ discordIds, discordUsername, epicUsername, status }) => ({
        discordIds,
        discordUsername,
        epicUsername,
        status,
      }))
      .sort((a, b) => a.discordUsername.localeCompare(b.discordUsername));

    const tierHistoryRows = await ctx.runQuery(
      internal.playerTierExport.listTierHistoryForPlayers,
      { participantIds: playerRows.map((row) => row.playerId) },
    );

    const tierHistory: ExportTierHistoryRecord[] = tierHistoryRows
      .flatMap((record) => {
        const discordIds = discordIdsByPlayerId.get(record.playerId);
        if (!discordIds || discordIds.length === 0) {
          return [];
        }
        return [
          {
            discordIds,
            ...(record.previousTier ? { previousTier: record.previousTier } : {}),
            newTier: record.newTier,
            date: record.date,
          },
        ];
      })
      .sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return (a.discordIds[0] ?? "").localeCompare(b.discordIds[0] ?? "");
      });

    return { players, tierHistory };
  },
});
