import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
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

async function collectYuniteImportIds(ctx: QueryCtx): Promise<Set<string>> {
  const yuniteImportIds = new Set<string>();
  let cursor: string | null = null;
  let done = false;

  while (!done) {
    const page = await ctx.db
      .query("thirdPartyImports")
      .paginate({ numItems: 500, cursor });
    for (const importRecord of page.page) {
      if (isYuniteImport(importRecord)) {
        yuniteImportIds.add(importRecord._id as string);
      }
    }
    done = page.isDone;
    cursor = page.continueCursor;
  }

  return yuniteImportIds;
}

async function collectZbdParticipantIds(ctx: QueryCtx): Promise<Set<Id<"players">>> {
  const participantIds = new Set<Id<"players">>();
  const yuniteImportIds = await collectYuniteImportIds(ctx);

  let eventResultsCursor: string | null = null;
  let eventResultsDone = false;
  while (!eventResultsDone) {
    const page = await ctx.db
      .query("eventResults")
      .paginate({ numItems: 2000, cursor: eventResultsCursor });
    for (const result of page.page) {
      participantIds.add(result.playerId);
    }
    eventResultsDone = page.isDone;
    eventResultsCursor = page.continueCursor;
  }

  let thirdPartyCursor: string | null = null;
  let thirdPartyDone = false;
  while (!thirdPartyDone) {
    const page = await ctx.db
      .query("thirdPartyResults")
      .paginate({ numItems: 2000, cursor: thirdPartyCursor });
    for (const result of page.page) {
      if (result.playerId && yuniteImportIds.has(result.importId as string)) {
        participantIds.add(result.playerId);
      }
    }
    thirdPartyDone = page.isDone;
    thirdPartyCursor = page.continueCursor;
  }

  return participantIds;
}

export const exportPlayersAndTierHistory = query({
  args: {},
  handler: async (ctx): Promise<{
    players: ExportPlayer[];
    tierHistory: ExportTierHistoryRecord[];
  }> => {
    await requireAdmin(ctx);

    const participantIds = await collectZbdParticipantIds(ctx);
    const players: ExportPlayer[] = [];
    const discordIdsByPlayerId = new Map<Id<"players">, string[]>();

    for (const playerId of participantIds) {
      const player = await ctx.db.get(playerId);
      if (!player) {
        continue;
      }

      const discordIds = collectStoredDiscordIds(player);
      players.push({
        discordIds,
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
        status: mapExportStatus(player),
      });

      if (discordIds.length > 0) {
        discordIdsByPlayerId.set(playerId, discordIds);
      }
    }

    players.sort((a, b) => a.discordUsername.localeCompare(b.discordUsername));

    const tierHistory: ExportTierHistoryRecord[] = [];
    let historyCursor: string | null = null;
    let historyDone = false;
    while (!historyDone) {
      const page = await ctx.db
        .query("tierHistory")
        .paginate({ numItems: 2000, cursor: historyCursor });
      for (const record of page.page) {
        if (!participantIds.has(record.playerId)) {
          continue;
        }

        const discordIds = discordIdsByPlayerId.get(record.playerId);
        if (!discordIds || discordIds.length === 0) {
          continue;
        }

        tierHistory.push({
          discordIds,
          ...(record.previousTier ? { previousTier: record.previousTier } : {}),
          newTier: record.tier,
          date: formatExportDate(record._creationTime),
        });
      }
      historyDone = page.isDone;
      historyCursor = page.continueCursor;
    }

    tierHistory.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return (a.discordIds[0] ?? "").localeCompare(b.discordIds[0] ?? "");
    });

    return { players, tierHistory };
  },
});
