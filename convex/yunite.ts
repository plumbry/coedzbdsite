import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Find player by Discord ID - includes ALL players regardless of status (active/archived)
 * This ensures historical match data stays linked even after a player is archived
 */
export const findPlayerByDiscordId = query({
  args: { discordUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("discordUserId"), args.discordUserId))
      .first();
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
      .filter((q) => 
        q.and(
          q.eq(q.field("importId"), args.importId),
          q.eq(q.field("discordId"), args.discordId)
        )
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
    // Update individual player eliminations and win data
    // Team kills come from tournament leaderboard and should not be changed
    await ctx.db.patch(args.resultId, {
      eliminations: args.eliminations,
      wins: args.wins,
      matchesPlayed: args.matchesPlayed,
    });
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
      // Update existing record
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
      });
      
      // Set hasMatchData flag on player
      await ctx.db.patch(args.playerId, {
        hasMatchData: true,
      });
      
      return existing._id;
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
      
      return matchStatsId;
    }
  },
});
