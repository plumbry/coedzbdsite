/**
 * Kill Credit Algorithm for Fortnite Team Modes (Duos / Trios / Squads)
 *
 * Source: Yunite API kill feed events (knocks + eliminations).
 * Yunite does NOT provide revive events, so revives are inferred.
 *
 * Rules:
 *   - Knock owner gets kill credit, NOT the finisher
 *   - Revive inferred if: re-knock on same player, OR 30s pass without elimination
 *   - Self-elimination = no credit
 *   - Storm/environmental death while knocked = knocker gets credit
 *   - Storm/environmental death while alive = no credit
 *   - Last player alive on a team skips DBNO → direct elimination
 */

/** Seconds after a knock where we assume the player was revived if not eliminated */
const REVIVE_TIMEOUT = 30;

type PlayerState = {
  state: "ALIVE" | "KNOCKED" | "ELIMINATED";
  knockedBy: string | null;
  knockTime: number | null;
};

type UnifiedEvent = {
  time: number;
  type: "knock" | "finish";
  killerDiscordId: string;
  victimDiscordId: string;
  weapon: string | undefined;
};

export type KillCreditResult = {
  killerDiscordId: string;
  victimDiscordId: string;
  weapon: string | undefined;
  timeInMatch: number;
};

/** A raw event from the killfeed with its classified state */
export type RawKillEvent = {
  killerDiscordId: string;
  victimDiscordId: string;
  weapon: string | undefined;
  timeInMatch: number;
  /** "knock" = downed, "finish" = eliminated someone knocked by another, "elimination" = full elim (same knocker) */
  eventType: "knock" | "elimination";
  /** Who originally knocked the victim (for elimination events only) */
  knockedBy: string | null;
};

/** Shape of a single kill feed entry from the Yunite API */
type KillFeedEntry = {
  player?: string;
  victim?: { discordId: string };
  knock?: boolean;
  finish?: boolean;
  time: number;
  strCause?: string;
  gun?: string;
};

/** Shape of a single team entry from a Yunite match response */
export type MatchTeamEntry = {
  team?: {
    players?: Array<{ discordId: string }>;
  };
  killFeeds?: Record<string, KillFeedEntry[]>;
};

/** Build a sorted timeline of all knock/finish events from match data */
function buildTimeline(matchData: MatchTeamEntry[]): UnifiedEvent[] {
  const timeline: UnifiedEvent[] = [];

  for (const entry of matchData) {
    const killFeeds = entry.killFeeds ?? {};
    for (const player of entry.team?.players ?? []) {
      if (!player.discordId) continue;
      const feed = killFeeds[player.discordId] ?? [];

      for (const evt of feed) {
        const victimId = evt.victim?.discordId ?? evt.player;
        if (!victimId) continue;

        const weapon = evt.strCause ?? evt.gun;

        if (evt.knock) {
          timeline.push({
            time: evt.time,
            type: "knock",
            killerDiscordId: player.discordId,
            victimDiscordId: victimId,
            weapon,
          });
        }
        if (evt.finish) {
          timeline.push({
            time: evt.time,
            type: "finish",
            killerDiscordId: player.discordId,
            victimDiscordId: victimId,
            weapon,
          });
        }
      }
    }
  }

  // Sort chronologically — knocks before finishes at equal timestamps
  timeline.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.type === "knock" && b.type === "finish") return -1;
    if (a.type === "finish" && b.type === "knock") return 1;
    return 0;
  });

  return timeline;
}

/** Initialize player states from match data */
function initPlayerStates(matchData: MatchTeamEntry[]): Map<string, PlayerState> {
  const playerStates = new Map<string, PlayerState>();
  for (const entry of matchData) {
    for (const player of entry.team?.players ?? []) {
      if (player.discordId && !playerStates.has(player.discordId)) {
        playerStates.set(player.discordId, {
          state: "ALIVE",
          knockedBy: null,
          knockTime: null,
        });
      }
    }
  }
  return playerStates;
}

/**
 * Process one match worth of Yunite data and return authoritative kill credits.
 *
 * @param matchData - Array of team entries for a single match (from Yunite match API)
 * @returns Array of kill credits, each awarding exactly one kill to one player
 */
export function processMatchKillCredits(
  matchData: MatchTeamEntry[],
): KillCreditResult[] {
  const playerStates = initPlayerStates(matchData);
  const timeline = buildTimeline(matchData);
  const credits: KillCreditResult[] = [];

  for (const evt of timeline) {
    if (!playerStates.has(evt.victimDiscordId)) {
      playerStates.set(evt.victimDiscordId, {
        state: "ALIVE",
        knockedBy: null,
        knockTime: null,
      });
    }

    const victim = playerStates.get(evt.victimDiscordId)!;

    if (evt.type === "knock") {
      victim.state = "KNOCKED";
      victim.knockedBy = evt.killerDiscordId;
      victim.knockTime = evt.time;
      continue;
    }

    // FINISH
    if (victim.state === "ELIMINATED") continue;

    // Revive inference
    if (
      victim.state === "KNOCKED" &&
      victim.knockTime !== null &&
      evt.time - victim.knockTime > REVIVE_TIMEOUT
    ) {
      victim.state = "ALIVE";
      victim.knockedBy = null;
      victim.knockTime = null;
    }

    if (victim.state === "KNOCKED") {
      if (victim.knockedBy && victim.knockedBy !== evt.victimDiscordId) {
        credits.push({
          killerDiscordId: victim.knockedBy,
          victimDiscordId: evt.victimDiscordId,
          weapon: evt.weapon,
          timeInMatch: evt.time,
        });
      } else if (victim.knockedBy === evt.victimDiscordId) {
        if (evt.killerDiscordId !== evt.victimDiscordId) {
          credits.push({
            killerDiscordId: evt.killerDiscordId,
            victimDiscordId: evt.victimDiscordId,
            weapon: evt.weapon,
            timeInMatch: evt.time,
          });
        }
      }
    } else {
      if (evt.killerDiscordId !== evt.victimDiscordId) {
        credits.push({
          killerDiscordId: evt.killerDiscordId,
          victimDiscordId: evt.victimDiscordId,
          weapon: evt.weapon,
          timeInMatch: evt.time,
        });
      }
    }

    victim.state = "ELIMINATED";
    victim.knockedBy = null;
    victim.knockTime = null;
  }

  return credits;
}

/**
 * Extract ALL raw killfeed events (knocks + eliminations) with their proper
 * Fortnite state classification. This produces the data needed for the
 * killfeed UI showing knocked / finished / eliminated states.
 *
 * @param matchData - Array of team entries for a single match
 * @returns Array of raw events with classified event types and knock attribution
 */
export function extractRawKillEvents(
  matchData: MatchTeamEntry[],
): RawKillEvent[] {
  const playerStates = initPlayerStates(matchData);
  const timeline = buildTimeline(matchData);
  const events: RawKillEvent[] = [];

  for (const evt of timeline) {
    if (!playerStates.has(evt.victimDiscordId)) {
      playerStates.set(evt.victimDiscordId, {
        state: "ALIVE",
        knockedBy: null,
        knockTime: null,
      });
    }

    const victim = playerStates.get(evt.victimDiscordId)!;

    if (evt.type === "knock") {
      // Skip self-knocks from the feed
      if (evt.killerDiscordId !== evt.victimDiscordId) {
        events.push({
          killerDiscordId: evt.killerDiscordId,
          victimDiscordId: evt.victimDiscordId,
          weapon: evt.weapon,
          timeInMatch: evt.time,
          eventType: "knock",
          knockedBy: null,
        });
      }
      victim.state = "KNOCKED";
      victim.knockedBy = evt.killerDiscordId;
      victim.knockTime = evt.time;
      continue;
    }

    // FINISH / ELIMINATION
    if (victim.state === "ELIMINATED") continue;

    // Revive inference
    if (
      victim.state === "KNOCKED" &&
      victim.knockTime !== null &&
      evt.time - victim.knockTime > REVIVE_TIMEOUT
    ) {
      victim.state = "ALIVE";
      victim.knockedBy = null;
      victim.knockTime = null;
    }

    // Skip self-eliminations
    if (evt.killerDiscordId === evt.victimDiscordId && victim.state !== "KNOCKED") {
      victim.state = "ELIMINATED";
      victim.knockedBy = null;
      victim.knockTime = null;
      continue;
    }

    // Record the elimination event with who knocked the victim
    const knockedBy = victim.state === "KNOCKED" ? victim.knockedBy : null;
    events.push({
      killerDiscordId: evt.killerDiscordId,
      victimDiscordId: evt.victimDiscordId,
      weapon: evt.weapon,
      timeInMatch: evt.time,
      eventType: "elimination",
      knockedBy,
    });

    victim.state = "ELIMINATED";
    victim.knockedBy = null;
    victim.knockTime = null;
  }

  return events;
}
