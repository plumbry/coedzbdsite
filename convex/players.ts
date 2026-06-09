import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { requireAdmin, getDisplayName } from "./auth_helpers";
import {
  loadFemaleVerificationLookup,
  enrichPlayerWithFemaleVerification,
} from "./helpers/femaleVerification";
import { logAudit } from "./helpers/audit";
import { api } from "./_generated/api";
import { syncInternalEventParticipation } from "./lib/stats/syncInternalEventParticipation";
import {
  filterVisibleMembers,
  isAltAccount,
  isVisibleInMemberLists,
} from "./helpers/playerAlt";
import { playerMatchesSearchTerm } from "./helpers/playerDiscordId";
import { fetchThirdPartyResultsForPlayer } from "./helpers/playerResults";
import { matchPlayerForImport } from "./lib/playerIdentity";
import { sortByTier } from "./helpers/tierSort";
import {
  removePlayerImportLookup,
  syncPlayerImportLookupForPlayer,
  upsertPlayerImportLookup,
} from "./helpers/playerImportLookup";

export const getPlayers = query({
  args: {},
  handler: async (ctx) => {
    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) =>
        q.eq("currentMembershipStatus", "accepted"),
      )
      .order("desc")
      .collect();

    const verificationLookup = await loadFemaleVerificationLookup(ctx);

    const enrichedPlayers = await Promise.all(
      filterVisibleMembers(activePlayers).map(async (player) => {
        const score = await ctx.db
          .query("manualScores")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .first();

        return enrichPlayerWithFemaleVerification(
          {
            ...player,
            gender: score?.gender,
          },
          verificationLookup,
        );
      }),
    );

    return sortByTier(enrichedPlayers, (p) => p.tier, (a, b) =>
      a.discordUsername.localeCompare(b.discordUsername),
    );
  },
});

// Get player by ID
export const getPlayerById = query({
  args: { id: v.id("players") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

async function findPlayerByUsername(ctx: QueryCtx, username: string) {
  const trimmed = username.trim();
  if (!trimmed) {
    return null;
  }

  const byDiscord = await ctx.db
    .query("players")
    .withIndex("by_discord_username", (q) => q.eq("discordUsername", trimmed))
    .first();

  if (byDiscord && isVisibleInMemberLists(byDiscord)) {
    return byDiscord;
  }

  const byEpic = await ctx.db
    .query("players")
    .withIndex("by_epic_username", (q) => q.eq("epicUsername", trimmed))
    .first();

  if (byEpic && isVisibleInMemberLists(byEpic)) {
    return byEpic;
  }

  // Case-insensitive fallback when URL casing differs from stored usernames
  for (const status of ["accepted", "former"] as const) {
    const members = filterVisibleMembers(
      await ctx.db
        .query("players")
        .withIndex("by_membership_status", (q) =>
          q.eq("currentMembershipStatus", status),
        )
        .collect(),
    );
    const { player } = matchPlayerForImport(members, {
      discordUsername: trimmed,
      epicUsername: trimmed,
    });
    if (player) {
      return await ctx.db.get(player._id);
    }
  }

  return null;
}

// Get player by username (Discord or Epic)
export const getPlayerByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await findPlayerByUsername(ctx, args.username);
  },
});

// Get player profile by ID with enrichment (optimized for single player view)
export const getPlayerProfile = query({
  args: { id: v.id("players") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const player = await ctx.db.get(args.id);
    
    if (!player || isAltAccount(player)) {
      return null;
    }
    
    const score = await ctx.db
      .query("manualScores")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .first();

    const verificationLookup = await loadFemaleVerificationLookup(ctx);

    return enrichPlayerWithFemaleVerification(
      {
        ...player,
        gender: score?.gender,
      },
      verificationLookup,
    );
  },
});

// Public query - get archived/former members
export const getArchivedPlayers = query({
  args: {},
  handler: async (ctx) => {
    const archivedPlayers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) =>
        q.eq("currentMembershipStatus", "former"),
      )
      .order("desc")
      .collect();

    const verificationLookup = await loadFemaleVerificationLookup(ctx);

    const enrichedPlayers = await Promise.all(
      archivedPlayers.map(async (player) => {
        const score = await ctx.db
          .query("manualScores")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .first();

        return enrichPlayerWithFemaleVerification(
          {
            ...player,
            gender: score?.gender,
          },
          verificationLookup,
        );
      }),
    );

    return enrichedPlayers;
  },
});

/** How many accepted members already have eventsPlayedCount populated. */
export const getAcceptedMemberEventCountCoverage = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const members = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) =>
        q.eq("currentMembershipStatus", "accepted"),
      )
      .collect();

    let withEventCount = 0;
    let overFiveEvents = 0;
    for (const member of members) {
      const count = member.eventsPlayedCount ?? 0;
      if (member.eventsPlayedCount !== undefined) {
        withEventCount += 1;
      }
      if (count > 5) {
        overFiveEvents += 1;
      }
    }

    return {
      totalAccepted: members.length,
      withEventCount,
      overFiveEvents,
      needsBackfill: withEventCount < members.length,
    };
  },
});

type EventParticipationBackfillResult = {
  updated: number;
  started: boolean;
  done: boolean;
  message?: string;
};

/** Backfill Yunite-only eventsPlayedCount via the unified player stats rebuild job. */
export const backfillPlayerEventParticipationStats = mutation({
  args: {
    playerId: v.optional(v.id("players")),
  },
  handler: async (ctx, args): Promise<EventParticipationBackfillResult> => {
    await requireAdmin(ctx);

    if (args.playerId) {
      await syncInternalEventParticipation(ctx, args.playerId);
      return { updated: 1, started: false, done: true };
    }

    const result: { jobId: Id<"playerStatsRebuildJobs">; message: string } =
      await ctx.runMutation(api.playerStatsRebuild.startFullPlayerStatsRebuild, {
        stopAfterPhase: "event_participation",
      });

    return {
      updated: 0,
      started: true,
      done: false,
      message: result.message,
    };
  },
});

// Slim player search for link dialogs — avoids full admin enrichment
export const searchPlayersForLinking = query({
  args: {
    search: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "Staff access required",
        code: "UNAUTHENTICATED",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      throw new ConvexError({
        message: "Admin or moderator access required",
        code: "FORBIDDEN",
      });
    }

    const needle = args.search.trim().toLowerCase();
    const maxResults = Math.min(args.limit ?? 50, 50);
    if (needle.length < 2) {
      return [];
    }

    const players = filterVisibleMembers(
      await ctx.db
        .query("players")
        .withIndex("by_membership_status", (q) =>
          q.eq("currentMembershipStatus", "accepted"),
        )
        .order("desc")
        .collect(),
    );

    return players
      .filter((player) => playerMatchesSearchTerm(player, needle))
      .slice(0, maxResults)
      .map((player) => ({
        _id: player._id,
        epicUsername: player.epicUsername,
        discordUsername: player.discordUsername,
      }));
  },
});

// Lightweight query for the Discord Members admin page - no per-player enrichment
export const getDiscordMembersAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const allPlayers = filterVisibleMembers(
      await ctx.db.query("players").order("desc").collect(),
    );

    // Return only the fields the Discord Members page needs
    const rows = allPlayers.map((player) => ({
      _id: player._id,
      _creationTime: player._creationTime,
      discordUsername: player.discordUsername,
      discordUserId: player.discordUserId,
      epicUsername: player.epicUsername,
      tier: player.tier,
      status: player.status,
      discordRoles: player.discordRoles,
      matchConfidence: player.matchConfidence,
      alternateDiscordUserIds: player.alternateDiscordUserIds,
    }));

    return sortByTier(rows, (p) => p.tier, (a, b) =>
      a.discordUsername.localeCompare(b.discordUsername),
    );
  },
});

export const createPlayer = mutation({
  args: {
    discordUsername: v.string(),
    nickname: v.optional(v.string()),
    discordUserId: v.string(),
    serverJoinDate: v.string(),
    epicUsername: v.string(),
    twitterUsername: v.optional(v.string()),
    twitchUsername: v.optional(v.string()),
    youtubeUsername: v.optional(v.string()),
    adminComments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Only admins can create players
    const user = await requireAdmin(ctx);
    
    const playerId = await ctx.db.insert("players", {
      discordUsername: args.discordUsername,
      nickname: args.nickname,
      discordUserId: args.discordUserId,
      serverJoinDate: args.serverJoinDate,
      epicUsername: args.epicUsername,
      twitterUsername: args.twitterUsername,
      twitchUsername: args.twitchUsername,
      youtubeUsername: args.youtubeUsername,
      adminComments: args.adminComments,
      createdBy: user._id,
    });
    await upsertPlayerImportLookup(ctx, {
      _id: playerId,
      discordUserId: args.discordUserId,
      epicUsername: args.epicUsername,
      discordUsername: args.discordUsername,
    });
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "player_created",
      entityType: "player",
      entityId: playerId,
      details: `Created player ${args.discordUsername}`,
    });
    
    return playerId;
  },
});

export const bulkCreatePlayers = mutation({
  args: {
    players: v.array(v.object({
      discordUsername: v.string(),
      nickname: v.optional(v.string()),
      discordUserId: v.optional(v.string()),
      serverJoinDate: v.optional(v.string()),
      epicUsername: v.string(),
      twitterUsername: v.optional(v.string()),
      twitchUsername: v.optional(v.string()),
      youtubeUsername: v.optional(v.string()),
      adminComments: v.optional(v.string()),
      status: v.optional(v.union(v.literal("active"), v.literal("rejected"), v.literal("archived"))),
      // Evaluation scores
      thirdPartyExperience: v.optional(v.number()),
      thirdPartyPerformance: v.optional(v.number()),
      inGameTourneyPerformance: v.optional(v.number()),
      officialEarnings: v.optional(v.number()),
      rankedPerformance: v.optional(v.number()),
      hoursPlayed: v.optional(v.number()),
      notorietyTeammates: v.optional(v.number()),
      age: v.optional(v.number()),
      gender: v.optional(v.number()),
      ability: v.optional(v.number()),
      region: v.optional(v.number()),
      gameSense: v.optional(v.number()),
      seasonPerformance: v.optional(v.number()),
      modifiers: v.optional(v.number()),
    })),
    updateExisting: v.optional(v.boolean()),
    archiveOnImport: v.optional(v.boolean()),
    markForReview: v.optional(v.boolean()),
    updateScoresOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Only admins can bulk import players
    const user = await requireAdmin(ctx);
    
    let successCount = 0;
    let failureCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];
    
    for (const playerData of args.players) {
      try {
        // Try to find existing player by Epic username or Discord username
        const existingByEpic = await ctx.db
          .query("players")
          .withIndex("by_epic_username", (q) => q.eq("epicUsername", playerData.epicUsername))
          .first();
          
        const existingByDiscord = await ctx.db
          .query("players")
          .withIndex("by_discord_username", (q) => q.eq("discordUsername", playerData.discordUsername))
          .first();
        
        const existingPlayer = existingByEpic || existingByDiscord;
        
        let playerId;
        
        if (existingPlayer) {
          if (args.updateScoresOnly) {
            // Update scores only mode - only update evaluation scores, not player info
            playerId = existingPlayer._id;
            updatedCount++;
            successCount++;
          } else if (args.updateExisting) {
            // Map status to currentMembershipStatus
            let currentMembershipStatus: "accepted" | "rejected" | "former" | undefined;
            if (playerData.status === "active") {
              currentMembershipStatus = "accepted";
            } else if (playerData.status === "archived") {
              currentMembershipStatus = "former";
            } else if (playerData.status === "rejected") {
              currentMembershipStatus = "rejected";
            }
            
            // Update existing player - update all fields
            await ctx.db.patch(existingPlayer._id, {
              discordUsername: playerData.discordUsername,
              nickname: playerData.nickname,
              epicUsername: playerData.epicUsername,
              twitterUsername: playerData.twitterUsername,
              twitchUsername: playerData.twitchUsername,
              youtubeUsername: playerData.youtubeUsername,
              adminComments: playerData.adminComments,
              // Only update if provided
              ...(playerData.discordUserId && { discordUserId: playerData.discordUserId }),
              ...(playerData.serverJoinDate && { serverJoinDate: playerData.serverJoinDate }),
              ...(playerData.status && { status: playerData.status }),
              ...(currentMembershipStatus && { currentMembershipStatus }),
            });
            playerId = existingPlayer._id;
            updatedCount++;
            successCount++;
          } else {
            failureCount++;
            errors.push(`Player ${playerData.epicUsername} already exists (skipped)`);
            continue;
          }
        } else {
          // Player doesn't exist
          if (args.updateScoresOnly) {
            // In scores-only mode, skip new players
            failureCount++;
            errors.push(`Player ${playerData.epicUsername} not found (skipped in scores-only mode)`);
            continue;
          }
          
          // Create new player
          // Generate placeholders if not provided
          const discordUserId = playerData.discordUserId || `placeholder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const serverJoinDate = playerData.serverJoinDate || new Date().toISOString().split('T')[0];
          
          // Determine status: use provided status, or default based on archiveOnImport flag
          const playerStatus = playerData.status || (args.archiveOnImport ? "archived" : "active");
          
          // Map status to currentMembershipStatus
          let currentMembershipStatus: "accepted" | "rejected" | "former";
          if (playerStatus === "active") {
            currentMembershipStatus = "accepted";
          } else if (playerStatus === "archived") {
            currentMembershipStatus = "former";
          } else {
            currentMembershipStatus = "rejected";
          }
          
          playerId = await ctx.db.insert("players", {
            discordUsername: playerData.discordUsername,
            nickname: playerData.nickname,
            discordUserId: discordUserId,
            serverJoinDate: serverJoinDate,
            epicUsername: playerData.epicUsername,
            twitterUsername: playerData.twitterUsername,
            twitchUsername: playerData.twitchUsername,
            youtubeUsername: playerData.youtubeUsername,
            adminComments: playerData.adminComments,
            createdBy: user._id,
            status: playerStatus,
            currentMembershipStatus,
            ...(args.archiveOnImport && { archiveReason: "other" }),
            ...(args.markForReview && { needsReview: true }),
          });
          await upsertPlayerImportLookup(ctx, {
            _id: playerId,
            discordUserId,
            epicUsername: playerData.epicUsername,
            discordUsername: playerData.discordUsername,
          });
          
          successCount++;
        }
        
        // If evaluation scores are provided, create or update the score record
        const hasScores = playerData.thirdPartyExperience !== undefined ||
                         playerData.thirdPartyPerformance !== undefined ||
                         playerData.inGameTourneyPerformance !== undefined ||
                         playerData.officialEarnings !== undefined ||
                         playerData.rankedPerformance !== undefined ||
                         playerData.hoursPlayed !== undefined ||
                         playerData.notorietyTeammates !== undefined ||
                         playerData.age !== undefined ||
                         playerData.gender !== undefined ||
                         playerData.ability !== undefined ||
                         playerData.region !== undefined ||
                         playerData.gameSense !== undefined ||
                         playerData.seasonPerformance !== undefined ||
                         playerData.modifiers !== undefined;
        
        if (hasScores) {
          // Calculate total score and tier (13 categories @ 100 + modifiers with no max)
          const scores = [
            playerData.thirdPartyExperience || 0,
            playerData.thirdPartyPerformance || 0,
            playerData.inGameTourneyPerformance || 0,
            playerData.officialEarnings || 0,
            playerData.rankedPerformance || 0,
            playerData.hoursPlayed || 0,
            playerData.notorietyTeammates || 0,
            playerData.age || 0,
            playerData.gender || 0,
            playerData.ability || 0,
            playerData.region || 0,
            playerData.gameSense || 0,
            playerData.seasonPerformance || 0,
            playerData.modifiers || 0,
          ];
          
          const totalScore = scores.reduce((sum, score) => sum + score, 0);
          
          let tier = "C";
          if (totalScore >= 1000) tier = "S";
          else if (totalScore >= 850) tier = "A";
          else if (totalScore >= 700) tier = "B";
          
          // Check for existing score
          const existingScore = await ctx.db
            .query("manualScores")
            .withIndex("by_player", (q) => q.eq("playerId", playerId))
            .first();
          
          if (existingScore) {
            // Update existing score
            await ctx.db.patch(existingScore._id, {
              thirdPartyExperience: playerData.thirdPartyExperience,
              thirdPartyPerformance: playerData.thirdPartyPerformance,
              inGameTourneyPerformance: playerData.inGameTourneyPerformance,
              officialEarnings: playerData.officialEarnings,
              rankedPerformance: playerData.rankedPerformance,
              hoursPlayed: playerData.hoursPlayed,
              notorietyTeammates: playerData.notorietyTeammates,
              age: playerData.age,
              gender: playerData.gender,
              ability: playerData.ability,
              region: playerData.region,
              gameSense: playerData.gameSense,
              seasonPerformance: playerData.seasonPerformance ?? 0,
              modifiers: playerData.modifiers ?? 0,
              totalScore,
              tier,
              evaluatedBy: user._id,
            });
          } else {
            // Create new score
            await ctx.db.insert("manualScores", {
              playerId,
              thirdPartyExperience: playerData.thirdPartyExperience,
              thirdPartyPerformance: playerData.thirdPartyPerformance,
              inGameTourneyPerformance: playerData.inGameTourneyPerformance,
              officialEarnings: playerData.officialEarnings,
              rankedPerformance: playerData.rankedPerformance,
              hoursPlayed: playerData.hoursPlayed,
              notorietyTeammates: playerData.notorietyTeammates,
              age: playerData.age,
              gender: playerData.gender,
              ability: playerData.ability,
              region: playerData.region,
              gameSense: playerData.gameSense,
              seasonPerformance: playerData.seasonPerformance ?? 0,
              modifiers: playerData.modifiers ?? 0,
              totalScore,
              tier,
              evaluatedBy: user._id,
            });
          }
          
          // Get current player tier before updating
          const currentPlayer = await ctx.db.get(playerId);
          const previousTier = currentPlayer?.tier;
          
          // Update player with tier, total score, and denormalized gender
          await ctx.db.patch(playerId, {
            totalScore,
            tier,
            ...(playerData.gender !== undefined ? { gender: playerData.gender } : {}),
          });
          
          // Create tier history if tier changed or is new
          if (previousTier && previousTier !== tier) {
            await ctx.db.insert("tierHistory", {
              playerId,
              tier,
              previousTier,
              totalScore,
              changedBy: user._id,
            });
          } else if (!previousTier) {
            // First time getting a tier
            await ctx.db.insert("tierHistory", {
              playerId,
              tier,
              totalScore,
              changedBy: user._id,
            });
          }
        }
      } catch (error) {
        failureCount++;
        errors.push(`Failed to import ${playerData.discordUsername}: ${error}`);
      }
    }
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "players_bulk_imported",
      entityType: "player",
      details: `Bulk imported ${successCount} players (${updatedCount} updated, ${failureCount} failed)`,
    });
    
    return { successCount, failureCount, updatedCount, errors };
  },
});

export const updatePlayer = mutation({
  args: {
    playerId: v.id("players"),
    discordUsername: v.string(),
    nickname: v.optional(v.string()),
    discordUserId: v.string(),
    serverJoinDate: v.string(),
    epicUsername: v.string(),
    epicId: v.optional(v.string()),
    twitterUsername: v.optional(v.string()),
    twitchUsername: v.optional(v.string()),
    youtubeUsername: v.optional(v.string()),
    adminComments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Only admins can update players
    const user = await requireAdmin(ctx);
    
    // Get existing player data
    const existingPlayer = await ctx.db.get(args.playerId);
    if (!existingPlayer) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }
    
    // Track Epic ID change
    const patchData: Record<string, unknown> = {
      discordUsername: args.discordUsername,
      nickname: args.nickname,
      discordUserId: args.discordUserId,
      serverJoinDate: args.serverJoinDate,
      epicUsername: args.epicUsername,
      epicId: args.epicId,
      twitterUsername: args.twitterUsername,
      twitchUsername: args.twitchUsername,
      youtubeUsername: args.youtubeUsername,
      adminComments: args.adminComments,
    };

    if (args.epicId && existingPlayer.epicId && args.epicId !== existingPlayer.epicId) {
      const previousEpicIds = existingPlayer.previousEpicIds ?? [];
      patchData.previousEpicIds = [
        ...previousEpicIds,
        { epicId: existingPlayer.epicId, changedAt: new Date().toISOString() },
      ];
    }

    // Update player
    await ctx.db.patch(args.playerId, patchData);
    await syncPlayerImportLookupForPlayer(ctx, args.playerId);
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "player_updated",
      entityType: "player",
      entityId: args.playerId,
      details: `Updated player profile for ${args.discordUsername}`,
      previousValue: JSON.stringify({
        discordUsername: existingPlayer.discordUsername,
        epicUsername: existingPlayer.epicUsername,
        nickname: existingPlayer.nickname,
        adminComments: existingPlayer.adminComments,
      }),
      newValue: JSON.stringify({
        discordUsername: args.discordUsername,
        epicUsername: args.epicUsername,
        nickname: args.nickname,
        adminComments: args.adminComments,
      }),
    });
    
    return args.playerId;
  },
});

// Update player profile (simplified version without Discord ID and server join date)
export const updatePlayerProfile = mutation({
  args: {
    playerId: v.id("players"),
    discordUsername: v.string(),
    nickname: v.optional(v.string()),
    epicUsername: v.string(),
    epicId: v.optional(v.string()),
    twitterUsername: v.optional(v.string()),
    twitchUsername: v.optional(v.string()),
    youtubeUsername: v.optional(v.string()),
    adminComments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Only admins can update players
    const user = await requireAdmin(ctx);
    
    // Get existing player data
    const existingPlayer = await ctx.db.get(args.playerId);
    if (!existingPlayer) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }
    
    // Track Epic ID change
    const patchData: Record<string, unknown> = {
      discordUsername: args.discordUsername,
      nickname: args.nickname,
      epicUsername: args.epicUsername,
      epicId: args.epicId,
      twitterUsername: args.twitterUsername,
      twitchUsername: args.twitchUsername,
      youtubeUsername: args.youtubeUsername,
      adminComments: args.adminComments,
    };

    if (args.epicId && existingPlayer.epicId && args.epicId !== existingPlayer.epicId) {
      const previousEpicIds = existingPlayer.previousEpicIds ?? [];
      patchData.previousEpicIds = [
        ...previousEpicIds,
        { epicId: existingPlayer.epicId, changedAt: new Date().toISOString() },
      ];
    }

    // Update player
    await ctx.db.patch(args.playerId, patchData);
    await syncPlayerImportLookupForPlayer(ctx, args.playerId);
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "player_profile_updated",
      entityType: "player",
      entityId: args.playerId,
      details: `Updated player profile for ${args.discordUsername}`,
      previousValue: JSON.stringify({
        discordUsername: existingPlayer.discordUsername,
        epicUsername: existingPlayer.epicUsername,
        nickname: existingPlayer.nickname,
      }),
      newValue: JSON.stringify({
        discordUsername: args.discordUsername,
        epicUsername: args.epicUsername,
        nickname: args.nickname,
      }),
    });
    
    return args.playerId;
  },
});

export const deleteAllArchivedPlayers = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    
    // Get all archived/former members
    const allPlayers = await ctx.db.query("players").collect();
    const archivedPlayers = allPlayers.filter(p => p.currentMembershipStatus === "former");
    
    let deletedCount = 0;
    
    // Delete each archived player and their related data
    for (const player of archivedPlayers) {
      // Delete player's scores
      const scores = await ctx.db
        .query("manualScores")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      
      for (const score of scores) {
        await ctx.db.delete(score._id);
      }
      
      // Delete player's tier history
      const tierHistory = await ctx.db
        .query("tierHistory")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      
      for (const history of tierHistory) {
        await ctx.db.delete(history._id);
      }
      
      // Delete the player
      await ctx.db.delete(player._id);
      deletedCount++;
    }
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "players_bulk_deleted",
      entityType: "player",
      details: `Deleted all ${deletedCount} archived players`,
    });
    
    return { deletedCount };
  },
});

export const deleteDiscordOnlyMembers = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    
    // Get all players
    const allPlayers = await ctx.db.query("players").collect();
    
    // Filter to only Discord synced members without tier assignments
    // These are players that:
    // 1. Have a real Discord ID (not a placeholder)
    // 2. Don't have a tier (not evaluated)
    const discordOnlyPlayers = allPlayers.filter(player => {
      const hasRealDiscordId = player.discordUserId && !player.discordUserId.startsWith("placeholder_");
      const hasNoTier = !player.tier;
      return hasRealDiscordId && hasNoTier;
    });
    
    let deletedCount = 0;
    
    // Delete each Discord-only player and their related data
    for (const player of discordOnlyPlayers) {
      // Delete player's scores (if any)
      const scores = await ctx.db
        .query("manualScores")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      
      for (const score of scores) {
        await ctx.db.delete(score._id);
      }
      
      // Delete player's tier history (if any)
      const tierHistory = await ctx.db
        .query("tierHistory")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      
      for (const history of tierHistory) {
        await ctx.db.delete(history._id);
      }
      
      // Delete the player
      await ctx.db.delete(player._id);
      deletedCount++;
    }
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "discord_only_members_deleted",
      entityType: "player",
      details: `Deleted ${deletedCount} Discord-only members (preserved ${allPlayers.length - deletedCount} evaluated players)`,
    });
    
    return { 
      deletedCount,
      preservedCount: allPlayers.length - deletedCount,
    };
  },
});

export const deleteAllPlayers = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    
    // Get all players
    const allPlayers = await ctx.db.query("players").collect();
    
    let deletedCount = 0;
    
    // Delete each player and their related data
    for (const player of allPlayers) {
      // Delete player's scores
      const scores = await ctx.db
        .query("manualScores")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      
      for (const score of scores) {
        await ctx.db.delete(score._id);
      }
      
      // Delete player's tier history
      const tierHistory = await ctx.db
        .query("tierHistory")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      
      for (const history of tierHistory) {
        await ctx.db.delete(history._id);
      }
      
      // Delete the player
      await ctx.db.delete(player._id);
      deletedCount++;
    }
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "all_players_deleted",
      entityType: "player",
      details: `Deleted all ${deletedCount} players from the database`,
    });
    
    return { deletedCount };
  },
});

export const deletePlayer = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    
    // Get the player
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }
    
    // Delete player's scores
    const scores = await ctx.db
      .query("manualScores")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    
    for (const score of scores) {
      await ctx.db.delete(score._id);
    }
    
    // Delete player's tier history
    const tierHistory = await ctx.db
      .query("tierHistory")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    
    for (const history of tierHistory) {
      await ctx.db.delete(history._id);
    }
    
    // Delete the player
    await ctx.db.delete(args.playerId);
    await removePlayerImportLookup(ctx, args.playerId);
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "player_deleted",
      entityType: "player",
      entityId: args.playerId,
      details: `Deleted player: ${player.discordUsername} (${player.epicUsername})`,
    });
    
    return { success: true };
  },
});

// Lightweight query for exports - no per-player enrichment, stays under read limits
export const getPlayersForExport = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "Staff access required",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    
    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      throw new ConvexError({
        message: "Admin or moderator access required",
        code: "FORBIDDEN",
      });
    }
    
    // Single collect - just 1 read operation
    const allPlayers = await ctx.db
      .query("players")
      .order("desc")
      .collect();
    
    return allPlayers;
  },
});

export const clearReviewFlag = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    
    // Get the player
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }
    
    // Clear the review flag
    await ctx.db.patch(args.playerId, {
      needsReview: false,
    });
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "player_review_cleared",
      entityType: "player",
      entityId: args.playerId,
      details: `Cleared review flag for player: ${player.discordUsername}`,
    });
    
    return { success: true };
  },
});

export const findPotentialDuplicates = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    
    // Get all players
    const allPlayers = await ctx.db.query("players").collect();
    
    // Group by potential duplicate keys
    const epicGroups = new Map<string, typeof allPlayers>();
    const discordGroups = new Map<string, typeof allPlayers>();
    const discordIdGroups = new Map<string, typeof allPlayers>();
    
    for (const player of allPlayers) {
      // Group by Epic username (case-insensitive)
      const epicLower = player.epicUsername.toLowerCase();
      if (!epicGroups.has(epicLower)) {
        epicGroups.set(epicLower, []);
      }
      epicGroups.get(epicLower)!.push(player);
      
      // Group by Discord username (case-insensitive)
      const discordLower = player.discordUsername.toLowerCase();
      if (!discordGroups.has(discordLower)) {
        discordGroups.set(discordLower, []);
      }
      discordGroups.get(discordLower)!.push(player);
      
      // Group by Discord ID (only real IDs, not placeholders)
      if (player.discordUserId && !player.discordUserId.startsWith("placeholder_")) {
        if (!discordIdGroups.has(player.discordUserId)) {
          discordIdGroups.set(player.discordUserId, []);
        }
        discordIdGroups.get(player.discordUserId)!.push(player);
      }
    }
    
    // Find groups with duplicates
    const duplicateGroups: Array<{
      type: "epic" | "discord" | "discordId";
      key: string;
      players: typeof allPlayers;
    }> = [];
    
    // Epic username duplicates
    for (const [key, players] of epicGroups) {
      if (players.length > 1) {
        duplicateGroups.push({ type: "epic", key, players });
      }
    }
    
    // Discord username duplicates
    for (const [key, players] of discordGroups) {
      if (players.length > 1) {
        // Only add if not already captured by Epic username
        const alreadyAdded = duplicateGroups.some(
          g => g.players.length === players.length && 
               g.players.every(p => players.includes(p))
        );
        if (!alreadyAdded) {
          duplicateGroups.push({ type: "discord", key, players });
        }
      }
    }
    
    // Discord ID duplicates
    for (const [key, players] of discordIdGroups) {
      if (players.length > 1) {
        // Only add if not already captured
        const alreadyAdded = duplicateGroups.some(
          g => g.players.length === players.length && 
               g.players.every(p => players.includes(p))
        );
        if (!alreadyAdded) {
          duplicateGroups.push({ type: "discordId", key, players });
        }
      }
    }
    
    return duplicateGroups;
  },
});

const isPlaceholderDiscordId = (id: string) =>
  id.startsWith("placeholder_") || id === "imported";

function resolveDiscordUserId(
  profile: { discordUserId: string },
  other: { discordUserId: string },
) {
  if (
    isPlaceholderDiscordId(profile.discordUserId) &&
    !isPlaceholderDiscordId(other.discordUserId)
  ) {
    return other.discordUserId;
  }
  return profile.discordUserId;
}

function buildProfileFieldsFromSource(
  profile: {
    discordUsername: string;
    nickname?: string;
    name?: string;
    avatarUrl?: string;
    discordUserId: string;
    alternateDiscordUserIds?: string[];
    serverJoinDate: string;
    epicUsername: string;
    epicId?: string;
    previousEpicIds?: Array<{ epicId: string; changedAt: string }>;
    platform?: "PC" | "PS4" | "XB1" | "SWITCH" | "MOBILE";
    twitterUsername?: string;
    twitchUsername?: string;
    youtubeUsername?: string;
    discordRoles?: Array<{ id: string; name: string }>;
    matchConfidence?: "exact" | "username" | "fuzzy" | "manual";
    status?: "active" | "archived" | "rejected" | "discord_member";
    currentMembershipStatus?: "accepted" | "rejected" | "former";
  },
  other: { discordUserId: string; epicId?: string; previousEpicIds?: Array<{ epicId: string; changedAt: string }>; platform?: "PC" | "PS4" | "XB1" | "SWITCH" | "MOBILE"; matchConfidence?: "exact" | "username" | "fuzzy" | "manual"; status?: "active" | "archived" | "rejected" | "discord_member"; currentMembershipStatus?: "accepted" | "rejected" | "former" },
) {
  return {
    discordUsername: profile.discordUsername,
    nickname: profile.nickname,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    discordUserId: resolveDiscordUserId(profile, other),
    alternateDiscordUserIds: profile.alternateDiscordUserIds,
    serverJoinDate: profile.serverJoinDate,
    epicUsername: profile.epicUsername,
    epicId: profile.epicId ?? other.epicId,
    previousEpicIds: profile.previousEpicIds ?? other.previousEpicIds,
    platform: profile.platform ?? other.platform,
    twitterUsername: profile.twitterUsername,
    twitchUsername: profile.twitchUsername,
    youtubeUsername: profile.youtubeUsername,
    discordRoles: profile.discordRoles,
    matchConfidence: profile.matchConfidence ?? other.matchConfidence,
    status: profile.status ?? other.status,
    currentMembershipStatus:
      profile.currentMembershipStatus ?? other.currentMembershipStatus,
  };
}

export const getPlayersMergePreview = query({
  args: {
    playerIdA: v.id("players"),
    playerIdB: v.id("players"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const load = async (playerId: Id<"players">) => {
      const player = await ctx.db.get(playerId);
      if (!player) return null;
      const score = await ctx.db
        .query("manualScores")
        .withIndex("by_player", (q) => q.eq("playerId", playerId))
        .first();
      return {
        _id: player._id,
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
        discordUserId: player.discordUserId,
        nickname: player.nickname,
        serverJoinDate: player.serverJoinDate,
        tier: player.tier,
        totalScore: player.totalScore,
        discordRoles: player.discordRoles,
        _creationTime: player._creationTime,
        evaluation: score
          ? {
              totalScore: score.totalScore,
              tier: score.tier,
              gender: score.gender,
            }
          : null,
      };
    };

    const a = await load(args.playerIdA);
    const b = await load(args.playerIdB);
    if (!a || !b) {
      throw new ConvexError({
        message: "One or both players not found",
        code: "NOT_FOUND",
      });
    }
    return { a, b };
  },
});

export const mergePlayers = mutation({
  args: {
    primaryPlayerId: v.id("players"),
    secondaryPlayerId: v.id("players"),
    selections: v.optional(
      v.object({
        profilePlayerId: v.id("players"),
        evaluationPlayerId: v.id("players"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    
    // Get both players
    const primaryPlayer = await ctx.db.get(args.primaryPlayerId);
    const secondaryPlayer = await ctx.db.get(args.secondaryPlayerId);
    
    if (!primaryPlayer || !secondaryPlayer) {
      throw new ConvexError({
        message: "One or both players not found",
        code: "NOT_FOUND",
      });
    }

    const playerIds = new Set([args.primaryPlayerId, args.secondaryPlayerId]);
    if (args.selections) {
      if (
        !playerIds.has(args.selections.profilePlayerId) ||
        !playerIds.has(args.selections.evaluationPlayerId)
      ) {
        throw new ConvexError({
          message: "Profile and evaluation selections must be one of the two players being merged",
          code: "INVALID_ARGUMENT",
        });
      }
    }

    const adminComments = [primaryPlayer.adminComments, secondaryPlayer.adminComments]
      .filter(Boolean)
      .join(" | ");

    let mergedData: Record<string, unknown>;
    let auditSelectionNote = "";

    if (!args.selections) {
      const isPlaceholderId = isPlaceholderDiscordId;
      mergedData = {
        discordUsername: primaryPlayer.discordUsername,
        nickname: primaryPlayer.nickname || secondaryPlayer.nickname,
        discordUserId:
          isPlaceholderId(primaryPlayer.discordUserId) &&
          !isPlaceholderId(secondaryPlayer.discordUserId)
            ? secondaryPlayer.discordUserId
            : primaryPlayer.discordUserId,
        serverJoinDate: primaryPlayer.serverJoinDate || secondaryPlayer.serverJoinDate,
        epicUsername: primaryPlayer.epicUsername,
        twitterUsername: primaryPlayer.twitterUsername || secondaryPlayer.twitterUsername,
        twitchUsername: primaryPlayer.twitchUsername || secondaryPlayer.twitchUsername,
        youtubeUsername: primaryPlayer.youtubeUsername || secondaryPlayer.youtubeUsername,
        adminComments,
        discordRoles: primaryPlayer.discordRoles || secondaryPlayer.discordRoles,
        tier: primaryPlayer.tier || secondaryPlayer.tier,
        totalScore: primaryPlayer.totalScore ?? secondaryPlayer.totalScore,
        status: primaryPlayer.status || secondaryPlayer.status,
      };
    } else {
      const profilePlayer =
        args.selections.profilePlayerId === args.secondaryPlayerId
          ? secondaryPlayer
          : primaryPlayer;
      const profileOther =
        profilePlayer._id === primaryPlayer._id ? secondaryPlayer : primaryPlayer;
      const evaluationPlayer =
        args.selections.evaluationPlayerId === args.secondaryPlayerId
          ? secondaryPlayer
          : primaryPlayer;

      mergedData = {
        ...buildProfileFieldsFromSource(profilePlayer, profileOther),
        adminComments,
        tier: evaluationPlayer.tier ?? profilePlayer.tier ?? profileOther.tier,
        totalScore:
          evaluationPlayer.totalScore ??
          profilePlayer.totalScore ??
          profileOther.totalScore,
      };

      auditSelectionNote = ` [profile: ${profilePlayer.discordUsername}, evaluation: ${evaluationPlayer.discordUsername}]`;
    }
    
    await ctx.db.patch(args.primaryPlayerId, mergedData);
    
    const primaryScore = await ctx.db
      .query("manualScores")
      .withIndex("by_player", (q) => q.eq("playerId", args.primaryPlayerId))
      .first();
    
    const secondaryScore = await ctx.db
      .query("manualScores")
      .withIndex("by_player", (q) => q.eq("playerId", args.secondaryPlayerId))
      .first();

    if (!args.selections) {
      if (secondaryScore && !primaryScore) {
        const { _id: _scoreId, _creationTime: _scoreCreated, ...scoreFields } =
          secondaryScore;
        await ctx.db.insert("manualScores", {
          ...scoreFields,
          playerId: args.primaryPlayerId,
          evaluatedBy: user._id,
        });
      }
    } else {
      const chosenScore =
        args.selections.evaluationPlayerId === args.secondaryPlayerId
          ? secondaryScore
          : primaryScore;

      if (primaryScore) {
        await ctx.db.delete(primaryScore._id);
      }
      if (secondaryScore) {
        await ctx.db.delete(secondaryScore._id);
      }

      if (chosenScore) {
        const { _id: _scoreId, _creationTime: _scoreCreated, ...scoreFields } =
          chosenScore;
        await ctx.db.insert("manualScores", {
          ...scoreFields,
          playerId: args.primaryPlayerId,
          evaluatedBy: user._id,
        });
      }
    }
    
    const secondaryTierHistory = await ctx.db
      .query("tierHistory")
      .withIndex("by_player", (q) => q.eq("playerId", args.secondaryPlayerId))
      .collect();
    
    for (const history of secondaryTierHistory) {
      await ctx.db.insert("tierHistory", {
        playerId: args.primaryPlayerId,
        tier: history.tier,
        previousTier: history.previousTier,
        totalScore: history.totalScore,
        changedBy: history.changedBy,
      });
    }
    
    if (!args.selections && secondaryScore) {
      await ctx.db.delete(secondaryScore._id);
    }
    
    for (const history of secondaryTierHistory) {
      await ctx.db.delete(history._id);
    }
    
    await ctx.db.delete(args.secondaryPlayerId);
    await syncPlayerImportLookupForPlayer(ctx, args.primaryPlayerId);
    await removePlayerImportLookup(ctx, args.secondaryPlayerId);
    
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "players_merged",
      entityType: "player",
      entityId: args.primaryPlayerId,
      details: `Merged ${secondaryPlayer.discordUsername} (${secondaryPlayer.epicUsername}) into ${primaryPlayer.discordUsername} (${primaryPlayer.epicUsername})${auditSelectionNote}`,
    });
    
    return { success: true, mergedPlayerId: args.primaryPlayerId };
  },
});

// Update player from Google Sheets
export const updatePlayerFromSheet = mutation({
  args: {
    playerId: v.id("players"),
    updateData: v.record(v.string(), v.union(v.string(), v.number(), v.null())),
    scores: v.record(v.string(), v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    // Only admins can update players from sheets
    await requireAdmin(ctx);
    
    // Update player fields (status, adminComments)
    const playerUpdates: Record<string, string> = {};
    if (args.updateData.status) {
      playerUpdates.status = args.updateData.status as string;
      
      // Map status to currentMembershipStatus
      const statusValue = args.updateData.status as string;
      if (statusValue === "active") {
        playerUpdates.currentMembershipStatus = "accepted";
      } else if (statusValue === "archived") {
        playerUpdates.currentMembershipStatus = "former";
      } else if (statusValue === "rejected") {
        playerUpdates.currentMembershipStatus = "rejected";
      }
    }
    if (args.updateData.adminComments) {
      playerUpdates.adminComments = args.updateData.adminComments as string;
    }
    
    if (Object.keys(playerUpdates).length > 0) {
      await ctx.db.patch(args.playerId, playerUpdates);
    }
    
    // Update or create evaluation scores
    const existingScore = await ctx.db
      .query("manualScores")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .first();
    
    // Prepare score data - only include defined values, default seasonPerformance and modifiers to 0
    const scoreData: Record<string, number> = {};
    for (const [key, value] of Object.entries(args.scores)) {
      if (value !== undefined && value !== null) {
        scoreData[key] = value;
      }
    }
    
    // Ensure seasonPerformance and modifiers default to 0 if not provided
    if (!('seasonPerformance' in scoreData)) {
      scoreData.seasonPerformance = 0;
    }
    if (!('modifiers' in scoreData)) {
      scoreData.modifiers = 0;
    }
    
    // Calculate total score
    const totalScore = 
      (scoreData.thirdPartyExperience || 0) +
      (scoreData.thirdPartyPerformance || 0) +
      (scoreData.inGameTourneyPerformance || 0) +
      (scoreData.officialEarnings || 0) +
      (scoreData.rankedPerformance || 0) +
      (scoreData.hoursPlayed || 0) +
      (scoreData.notorietyTeammates || 0) +
      (scoreData.age || 0) +
      (scoreData.gender || 0) +
      (scoreData.ability || 0) +
      (scoreData.region || 0) +
      (scoreData.gameSense || 0) +
      (scoreData.seasonPerformance || 0) +
      (scoreData.modifiers || 0);
    
    if (existingScore) {
      // Update existing score
      await ctx.db.patch(existingScore._id, {
        ...scoreData,
        totalScore,
      });
    } else {
      // Get the existing score to determine tier or default to "Unranked"
      const player = await ctx.db.get(args.playerId);
      const tier = player?.tier || "Unranked";
      
      // Create new score
      await ctx.db.insert("manualScores", {
        playerId: args.playerId,
        ...scoreData,
        totalScore,
        tier,
      });
    }
    
    return { success: true };
  },
});
