import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type KillEventRow = Doc<"matchKillEvents">;

export type KillEventListItem = {
  _id: KillEventRow["_id"];
  _creationTime: KillEventRow["_creationTime"];
  importId: KillEventRow["importId"];
  sessionId: KillEventRow["sessionId"];
  killerDiscordId: KillEventRow["killerDiscordId"];
  killerPlayerId: KillEventRow["killerPlayerId"];
  killerTier: KillEventRow["killerTier"];
  victimDiscordId: KillEventRow["victimDiscordId"];
  victimPlayerId: KillEventRow["victimPlayerId"];
  victimTier: KillEventRow["victimTier"];
  isUpset: KillEventRow["isUpset"];
  tierDifference: KillEventRow["tierDifference"];
  eventType: KillEventRow["eventType"];
  weapon: KillEventRow["weapon"];
  timeInMatch: KillEventRow["timeInMatch"];
  knockedBy: KillEventRow["knockedBy"];
  killerName: string;
  killerEpicUsername: string | undefined;
  victimName: string;
  victimEpicUsername: string | undefined;
  eventName: string;
  eventDate: string | undefined;
};

function playerDisplayName(
  player: Doc<"players"> | null,
  discordId: string,
): string {
  return player?.discordUsername || player?.epicUsername || discordId;
}

function displayFromStored(event: KillEventRow): KillEventListItem | null {
  if (event.killerName === undefined || event.victimName === undefined) {
    return null;
  }

  return {
    _id: event._id,
    _creationTime: event._creationTime,
    importId: event.importId,
    sessionId: event.sessionId,
    killerDiscordId: event.killerDiscordId,
    killerPlayerId: event.killerPlayerId,
    killerTier: event.killerTier,
    victimDiscordId: event.victimDiscordId,
    victimPlayerId: event.victimPlayerId,
    victimTier: event.victimTier,
    isUpset: event.isUpset,
    tierDifference: event.tierDifference,
    eventType: event.eventType,
    weapon: event.weapon,
    timeInMatch: event.timeInMatch,
    knockedBy: event.knockedBy,
    killerName: event.killerName,
    killerEpicUsername: event.killerEpicUsername,
    victimName: event.victimName,
    victimEpicUsername: event.victimEpicUsername,
    eventName: event.eventName ?? "Unknown Event",
    eventDate: event.eventDate,
  };
}

/** Batch-fetch players/imports once per page instead of per-row N+1 reads. */
export async function enrichKillEventsForList(
  ctx: QueryCtx,
  events: KillEventRow[],
): Promise<KillEventListItem[]> {
  if (events.length === 0) {
    return [];
  }

  const playerIds = new Set<Id<"players">>();
  const importIds = new Set<Id<"thirdPartyImports">>();

  for (const event of events) {
    if (event.killerName === undefined) {
      if (event.killerPlayerId) playerIds.add(event.killerPlayerId);
      importIds.add(event.importId);
    }
    if (event.victimName === undefined) {
      if (event.victimPlayerId) playerIds.add(event.victimPlayerId);
      importIds.add(event.importId);
    }
  }

  const playerCache = new Map<Id<"players">, Doc<"players"> | null>();
  for (const playerId of playerIds) {
    playerCache.set(playerId, await ctx.db.get(playerId));
  }

  const importCache = new Map<Id<"thirdPartyImports">, Doc<"thirdPartyImports"> | null>();
  for (const importId of importIds) {
    importCache.set(importId, await ctx.db.get(importId));
  }

  return events.map((event) => {
    const stored = displayFromStored(event);
    if (stored) {
      return stored;
    }

    const killer = event.killerPlayerId
      ? playerCache.get(event.killerPlayerId) ?? null
      : null;
    const victim = event.victimPlayerId
      ? playerCache.get(event.victimPlayerId) ?? null
      : null;
    const importRecord = importCache.get(event.importId) ?? null;

    return {
      _id: event._id,
      _creationTime: event._creationTime,
      importId: event.importId,
      sessionId: event.sessionId,
      killerDiscordId: event.killerDiscordId,
      killerPlayerId: event.killerPlayerId,
      killerTier: event.killerTier,
      victimDiscordId: event.victimDiscordId,
      victimPlayerId: event.victimPlayerId,
      victimTier: event.victimTier,
      isUpset: event.isUpset,
      tierDifference: event.tierDifference,
      eventType: event.eventType,
      weapon: event.weapon,
      timeInMatch: event.timeInMatch,
      knockedBy: event.knockedBy,
      killerName: playerDisplayName(killer, event.killerDiscordId),
      killerEpicUsername: killer?.epicUsername,
      victimName: playerDisplayName(victim, event.victimDiscordId),
      victimEpicUsername: victim?.epicUsername,
      eventName: importRecord?.eventName ?? "Unknown Event",
      eventDate: importRecord?.eventDate,
    };
  });
}

export async function buildKillEventDisplayFields(
  ctx: QueryCtx,
  args: {
    importId: Id<"thirdPartyImports">;
    killerDiscordId: string;
    killerPlayerId?: Id<"players">;
    victimDiscordId: string;
    victimPlayerId?: Id<"players">;
  },
  caches?: {
    importRecord?: Doc<"thirdPartyImports"> | null;
    players?: Map<Id<"players">, Doc<"players"> | null>;
  },
): Promise<{
  killerName: string;
  killerEpicUsername?: string;
  victimName: string;
  victimEpicUsername?: string;
  eventName?: string;
  eventDate?: string;
}> {
  const importRecord =
    caches?.importRecord !== undefined
      ? caches.importRecord
      : await ctx.db.get(args.importId);

  const getPlayer = async (playerId: Id<"players"> | undefined) => {
    if (!playerId) return null;
    if (caches?.players?.has(playerId)) {
      return caches.players.get(playerId) ?? null;
    }
    const player = await ctx.db.get(playerId);
    caches?.players?.set(playerId, player);
    return player;
  };

  const killer = await getPlayer(args.killerPlayerId);
  const victim = await getPlayer(args.victimPlayerId);

  return {
    killerName: playerDisplayName(killer, args.killerDiscordId),
    killerEpicUsername: killer?.epicUsername,
    victimName: playerDisplayName(victim, args.victimDiscordId),
    victimEpicUsername: victim?.epicUsername,
    eventName: importRecord?.eventName,
    eventDate: importRecord?.eventDate,
  };
}
