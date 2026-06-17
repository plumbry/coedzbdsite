export type RawKillFeedEntry = {
  player?: string;
  victim?: { discordId?: string };
  knock?: boolean;
  finish?: boolean;
  time?: number;
};

export type KillFeedEvent = {
  killerDiscordId: string;
  victimDiscordId?: string;
  knock?: boolean;
  finish?: boolean;
  time?: number;
};

/** Yunite kill-feed keys are often truncated Discord IDs. */
export function buildPartialDiscordIdMap(
  playerDiscordIds: string[],
  killFeedKeys: string[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const discordId of playerDiscordIds) {
    for (const partialId of killFeedKeys) {
      if (discordId.startsWith(partialId)) {
        map[partialId] = discordId;
        break;
      }
    }
  }
  return map;
}

export function getPlayerKillFeedEntries(
  killFeeds: Record<string, RawKillFeedEntry[]>,
  playerDiscordId: string,
): RawKillFeedEntry[] {
  if (killFeeds[playerDiscordId]?.length) {
    return killFeeds[playerDiscordId];
  }
  for (const [partialId, entries] of Object.entries(killFeeds)) {
    if (playerDiscordId.startsWith(partialId)) {
      return entries;
    }
  }
  return [];
}

export function collectMatchKillFeedEvents(
  players: Array<{ discordId: string }>,
  killFeeds: Record<string, RawKillFeedEntry[]>,
): KillFeedEvent[] {
  const events: KillFeedEvent[] = [];
  const partialMap = buildPartialDiscordIdMap(
    players.map((player) => player.discordId).filter(Boolean),
    Object.keys(killFeeds),
  );

  for (const player of players) {
    if (!player.discordId) {
      continue;
    }

    const partialId = Object.keys(partialMap).find(
      (key) => partialMap[key] === player.discordId,
    );
    const playerKillFeed =
      (partialId && killFeeds[partialId]) ||
      getPlayerKillFeedEntries(killFeeds, player.discordId);

    for (const kill of playerKillFeed) {
      events.push({
        killerDiscordId: player.discordId,
        victimDiscordId: kill.victim?.discordId || kill.player,
        knock: kill.knock,
        finish: kill.finish,
        time: kill.time,
      });
    }
  }

  return events;
}

const KNOCK_TIMEOUT_SECONDS = 45;

/** Credit eliminations using the same knock / finish rules as the Yunite review UI. */
export function calculateEliminationsFromEvents(
  events: KillFeedEvent[],
): Record<string, number> {
  const sorted = [...events].sort((a, b) => (a.time || 0) - (b.time || 0));
  const knockMap: Record<string, { knocker: string; timestamp: number }> = {};
  const eliminations: Record<string, number> = {};

  for (const event of sorted) {
    const victim = event.victimDiscordId;
    const killer = event.killerDiscordId;
    if (!victim) {
      continue;
    }
    if (killer === victim) {
      delete knockMap[victim];
      continue;
    }

    const isKnock = event.knock && !event.finish;
    const isElim = event.finish || (!event.knock && !event.finish);

    if (isKnock) {
      knockMap[victim] = { knocker: killer, timestamp: event.time || 0 };
    } else if (isElim) {
      const knockData = knockMap[victim];
      if (knockData) {
        const timeSinceKnock = (event.time || 0) - knockData.timestamp;
        if (timeSinceKnock <= KNOCK_TIMEOUT_SECONDS) {
          eliminations[knockData.knocker] =
            (eliminations[knockData.knocker] || 0) + 1;
        } else {
          eliminations[killer] = (eliminations[killer] || 0) + 1;
        }
        delete knockMap[victim];
      } else {
        eliminations[killer] = (eliminations[killer] || 0) + 1;
      }
    }
  }

  return eliminations;
}

export function sumTeamPlayerEliminations(
  players: Array<{ discordId: string }>,
  eliminationsByDiscordId: Record<string, number>,
): number {
  return players.reduce((sum, player) => {
    if (!player.discordId) {
      return sum;
    }
    return sum + (eliminationsByDiscordId[player.discordId] || 0);
  }, 0);
}

export function countKnocksInFeed(entries: RawKillFeedEntry[]): number {
  return entries.filter((kill) => kill.knock === true && kill.finish !== true)
    .length;
}
