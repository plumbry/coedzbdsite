import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { isYuniteImport } from "./importSource";

export type EventCacheStats = {
  totalPlayers: number;
  totalTeams: number;
  lastYunitSync?: number;
};

function yuniteSyncTimestamp(importRecord: {
  matchDataSyncedAt?: number;
  matchDataSynced?: boolean;
  finalizedAt?: number;
  _creationTime: number;
}): number | undefined {
  if (importRecord.matchDataSyncedAt) {
    return importRecord.matchDataSyncedAt;
  }
  if (importRecord.finalizedAt) {
    return importRecord.finalizedAt;
  }
  if (importRecord.matchDataSynced) {
    return importRecord._creationTime;
  }
  return importRecord._creationTime;
}

/** Derive cached leaderboard totals and Yunite sync time from linked imports. */
export async function computeEventCacheStats(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<EventCacheStats | null> {
  const imports = await ctx.db
    .query("thirdPartyImports")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();

  if (imports.length === 0) {
    return null;
  }

  const allDiscordIds = new Set<string>();
  const teamIds = new Set<string>();
  let lastYunitSync: number | undefined;

  for (const imp of imports) {
    const results = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", imp._id))
      .collect();

    for (const result of results) {
      if (result.discordId) {
        allDiscordIds.add(result.discordId);
      }
      if (result.teamId) {
        teamIds.add(`${imp._id}:${result.teamId}`);
      } else {
        teamIds.add(`${imp._id}:${result.placement}_${result.points}`);
      }
    }

    if (isYuniteImport(imp)) {
      const ts = yuniteSyncTimestamp(imp);
      if (ts && (!lastYunitSync || ts > lastYunitSync)) {
        lastYunitSync = ts;
      }
    }
  }

  if (allDiscordIds.size === 0 && teamIds.size === 0 && !lastYunitSync) {
    return null;
  }

  return {
    totalPlayers: allDiscordIds.size,
    totalTeams: teamIds.size,
    lastYunitSync,
  };
}

export async function refreshEventCache(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<{ updated: boolean } & Partial<EventCacheStats>> {
  const stats = await computeEventCacheStats(ctx, eventId);
  if (!stats) {
    return { updated: false };
  }

  await ctx.db.patch(eventId, {
    totalPlayers: stats.totalPlayers,
    totalTeams: stats.totalTeams,
    lastYunitSync: stats.lastYunitSync,
  });

  return { updated: true, ...stats };
}

export async function refreshEventCacheForImport(
  ctx: MutationCtx,
  importId: Id<"thirdPartyImports">,
) {
  const importRecord = await ctx.db.get(importId);
  if (!importRecord?.eventId) {
    return { updated: false };
  }
  return refreshEventCache(ctx, importRecord.eventId);
}
