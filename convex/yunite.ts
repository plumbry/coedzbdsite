import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolvePlayerByDiscordId } from "./helpers/playerDiscordId";
import { syncPlayerImportLookupForPlayer } from "./helpers/playerImportLookup";

/**
 * Find player by Discord ID - includes ALL players regardless of status (active/archived)
 * Matches primary and alternate Discord IDs.
 * This ensures historical match data stays linked even after a player is archived
 */
export const findPlayerByDiscordId = query({
  args: { discordUserId: v.string() },
  handler: async (ctx, args) => {
    const match = await resolvePlayerByDiscordId(ctx, args.discordUserId);
    return match?.player ?? null;
  },
});

/**
 * Find player by Epic username - includes ALL players regardless of status (active/archived)
 * This ensures historical match data stays linked even after a player is archived
 */
export const findPlayerByEpicUsername = query({
  args: { epicUsername: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("by_epic_username", (q) => q.eq("epicUsername", args.epicUsername))
      .first();
  },
});

export const findExistingEvent = query({
  args: {
    playerId: v.id("players"),
    importId: v.optional(v.id("thirdPartyImports")),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    
    // If importId is provided, check by importId (prevents duplicates from same import)
    if (args.importId) {
      return events.find((e) => e.importId === args.importId);
    }
    
    // Fallback: no match
    return undefined;
  },
});

export const updateEventResult = mutation({
  args: {
    eventId: v.id("eventResults"),
    placement: v.number(),
    eliminations: v.number(),
    kdRatio: v.number(),
    eventScore: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      placement: args.placement,
      eliminations: args.eliminations,
      kdRatio: args.kdRatio,
      eventScore: args.eventScore,
    });
  },
});

/**
 * Update a player's Epic Account ID, saving the old one to history if it changed.
 * Called during Yunite sync when a new epicId is detected for a matched player.
 */
export const updatePlayerEpicId = mutation({
  args: {
    playerId: v.id("players"),
    epicId: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) return;

    if (player.epicId === args.epicId) {
      return;
    }

    if (player.epicId && player.epicId !== args.epicId) {
      // Epic ID changed — save old one to history
      const previousEpicIds = player.previousEpicIds ?? [];
      await ctx.db.patch(args.playerId, {
        epicId: args.epicId,
        previousEpicIds: [
          ...previousEpicIds,
          { epicId: player.epicId, changedAt: new Date().toISOString() },
        ],
      });
    } else if (!player.epicId) {
      // First time setting epicId
      await ctx.db.patch(args.playerId, {
        epicId: args.epicId,
      });
    }

    await syncPlayerImportLookupForPlayer(ctx, args.playerId);
  },
});

export const findResultByDiscordId = query({
  args: {
    importId: v.id("thirdPartyImports"),
    discordId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import_discord", (q) =>
        q.eq("importId", args.importId).eq("discordId", args.discordId),
      )
      .first();
  },
});

export const updateResultWithMatchData = mutation({
  args: {
    resultId: v.id("thirdPartyResults"),
    eliminations: v.number(),
    deaths: v.number(),
    wins: v.optional(v.number()),
    matchesPlayed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.resultId);
    if (!existing) {
      return { updated: false, skippedNoChange: false };
    }

    const unchanged =
      (existing.eliminations ?? 0) === args.eliminations &&
      (existing.deaths ?? 0) === args.deaths &&
      (existing.wins ?? 0) === (args.wins ?? 0) &&
      (existing.matchesPlayed ?? 0) === (args.matchesPlayed ?? 0);

    if (unchanged) {
      return { updated: false, skippedNoChange: true };
    }

    await ctx.db.patch(args.resultId, {
      eliminations: args.eliminations,
      deaths: args.deaths,
      wins: args.wins,
      matchesPlayed: args.matchesPlayed,
    });
    return { updated: true, skippedNoChange: false };
  },
});

export const updateResultTeamMembers = mutation({
  args: {
    resultId: v.id("thirdPartyResults"),
    teamMembers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.resultId, {
      teamMembers: args.teamMembers,
    });
  },
});

export const storeMatchPlayerStats = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
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
  },
  handler: async (ctx, args) => {
    // Check if this record already exists
    const existing = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_match", (q) => 
        q.eq("importId", args.importId).eq("sessionId", args.sessionId)
      )
      .filter((q) => q.eq(q.field("discordId"), args.discordId))
      .first();
    
    if (existing) {
      const unchanged =
        existing.placement === args.placement &&
        existing.eliminations === args.eliminations &&
        existing.knocks === args.knocks &&
        existing.deaths === args.deaths &&
        existing.teamTotalKills === args.teamTotalKills &&
        (existing.teamId ?? undefined) === (args.teamId ?? undefined) &&
        (existing.duoDiscordId ?? undefined) === (args.duoDiscordId ?? undefined) &&
        (existing.deathTime ?? undefined) === (args.deathTime ?? undefined) &&
        (existing.duoDeathTime ?? undefined) === (args.duoDeathTime ?? undefined) &&
        (existing.killsAfterDuoDeath ?? undefined) ===
          (args.killsAfterDuoDeath ?? undefined) &&
        (existing.timeAliveAfterDuoDeath ?? undefined) ===
          (args.timeAliveAfterDuoDeath ?? undefined) &&
        existing.playerId === args.playerId;

      if (unchanged) {
        return { id: existing._id, skippedNoChange: true };
      }

      await ctx.db.patch(existing._id, {
        teamId: args.teamId,
        duoDiscordId: args.duoDiscordId,
        placement: args.placement,
        eliminations: args.eliminations,
        knocks: args.knocks,
        deaths: args.deaths,
        teamTotalKills: args.teamTotalKills,
        deathTime: args.deathTime,
        duoDeathTime: args.duoDeathTime,
        killsAfterDuoDeath: args.killsAfterDuoDeath,
        timeAliveAfterDuoDeath: args.timeAliveAfterDuoDeath,
        playerId: args.playerId,
      });

      await ctx.db.patch(args.playerId, {
        hasMatchData: true,
      });

      return { id: existing._id, skippedNoChange: false };
    } else {
      // Create new record
      const matchStatsId = await ctx.db.insert("matchPlayerStats", {
        importId: args.importId,
        sessionId: args.sessionId,
        playerId: args.playerId,
        discordId: args.discordId,
        teamId: args.teamId,
        duoDiscordId: args.duoDiscordId,
        placement: args.placement,
        eliminations: args.eliminations,
        knocks: args.knocks,
        deaths: args.deaths,
        teamTotalKills: args.teamTotalKills,
        deathTime: args.deathTime,
        duoDeathTime: args.duoDeathTime,
        killsAfterDuoDeath: args.killsAfterDuoDeath,
        timeAliveAfterDuoDeath: args.timeAliveAfterDuoDeath,
      });
      
      // Set hasMatchData flag on player
      await ctx.db.patch(args.playerId, {
        hasMatchData: true,
      });

      return { id: matchStatsId, skippedNoChange: false };
    }
  },
});
