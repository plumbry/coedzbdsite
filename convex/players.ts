import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, getDisplayName } from "./auth_helpers";
import { logAudit } from "./helpers/audit";
import { internal } from "./_generated/api";

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

    const enrichedPlayers = await Promise.all(
      activePlayers.map(async (player) => {
        const score = await ctx.db
          .query("manualScores")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .first();

        return {
          ...player,
          femaleVerified: score?.femaleVerified ?? false,
          verificationMethod: score?.verificationMethod,
          gender: score?.gender,
        };
      }),
    );

    return enrichedPlayers;
  },
});

// Get player by ID
export const getPlayerById = query({
  args: { id: v.id("players") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get player by username (Discord or Epic)
export const getPlayerByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    // Try to find by Discord username first (case insensitive)
    const byDiscord = await ctx.db
      .query("players")
      .withIndex("by_discord_username", (q) => q.eq("discordUsername", args.username))
      .first();
    
    if (byDiscord) {
      return byDiscord;
    }
    
    // Try to find by Epic username (case insensitive)
    const byEpic = await ctx.db
      .query("players")
      .withIndex("by_epic_username", (q) => q.eq("epicUsername", args.username))
      .first();
    
    return byEpic || null;
  },
});

// Get player profile by ID with enrichment (optimized for single player view)
export const getPlayerProfile = query({
  args: { id: v.id("players") },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.id);
    
    if (!player) {
      return null;
    }
    
    // Enrich with female verification status and gender
    const score = await ctx.db
      .query("manualScores")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .first();
    
    return {
      ...player,
      femaleVerified: score?.femaleVerified ?? false,
      verificationMethod: score?.verificationMethod,
      gender: score?.gender,
    };
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

    const enrichedPlayers = await Promise.all(
      archivedPlayers.map(async (player) => {
        const score = await ctx.db
          .query("manualScores")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .first();

        return {
          ...player,
          femaleVerified: score?.femaleVerified ?? false,
          verificationMethod: score?.verificationMethod,
          gender: score?.gender,
        };
      }),
    );

    return enrichedPlayers;
  },
});

// Admin-only query - get rejected members
export const getRejectedPlayers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const rejectedPlayers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) =>
        q.eq("currentMembershipStatus", "rejected"),
      )
      .order("desc")
      .collect();

    const enrichedPlayers = await Promise.all(
      rejectedPlayers.map(async (player) => {
        const score = await ctx.db
          .query("manualScores")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .first();

        return {
          ...player,
          femaleVerified: score?.femaleVerified ?? false,
          verificationMethod: score?.verificationMethod,
          gender: score?.gender,
        };
      }),
    );

    return enrichedPlayers;
  },
});

// Lightweight query for tier simulation search - only returns fields needed for search autocomplete
export const getPlayersForSimulation = query({
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

    // Only get accepted members with minimal fields - no enrichment queries
    const acceptedPlayers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) =>
        q.eq("currentMembershipStatus", "accepted")
      )
      .collect();

    return acceptedPlayers.map((p) => ({
      _id: p._id,
      discordUsername: p.discordUsername,
      epicUsername: p.epicUsername,
      tier: p.tier,
      currentMembershipStatus: p.currentMembershipStatus,
    }));
  },
});

// Admin and Moderator: Get all players including archived and rejected
export const getAllPlayersAdmin = query({
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
    
    const allPlayers = await ctx.db
      .query("players")
      .order("desc")
      .collect();
    
    // Build duplicate detection maps
    const epicUsernameCounts = new Map<string, number>();
    const discordUsernameCounts = new Map<string, number>();
    const discordIdCounts = new Map<string, number>();
    
    for (const player of allPlayers) {
      const epicLower = player.epicUsername.toLowerCase();
      const discordLower = player.discordUsername.toLowerCase();
      
      epicUsernameCounts.set(epicLower, (epicUsernameCounts.get(epicLower) || 0) + 1);
      discordUsernameCounts.set(discordLower, (discordUsernameCounts.get(discordLower) || 0) + 1);
      
      if (player.discordUserId && !player.discordUserId.startsWith("placeholder_")) {
        discordIdCounts.set(player.discordUserId, (discordIdCounts.get(player.discordUserId) || 0) + 1);
      }
    }
    
    // Enrich with female verification status, gender, duplicate info, and event count
    const enrichedPlayers = await Promise.all(
      allPlayers.map(async (player) => {
        const score = await ctx.db
          .query("manualScores")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .first();

        const eventsPlayed = player.eventsPlayedCount ?? 0;
        
        const epicLower = player.epicUsername.toLowerCase();
        const discordLower = player.discordUsername.toLowerCase();
        const duplicateEpicCount = epicUsernameCounts.get(epicLower) || 0;
        const duplicateDiscordCount = discordUsernameCounts.get(discordLower) || 0;
        const duplicateDiscordIdCount = player.discordUserId && !player.discordUserId.startsWith("placeholder_") 
          ? discordIdCounts.get(player.discordUserId) || 0
          : 0;
        
        return {
          ...player,
          femaleVerified: score?.femaleVerified ?? false,
          verificationMethod: score?.verificationMethod,
          gender: score?.gender,
          duplicateEpicCount: duplicateEpicCount > 1 ? duplicateEpicCount : 0,
          duplicateDiscordCount: duplicateDiscordCount > 1 ? duplicateDiscordCount : 0,
          duplicateDiscordIdCount: duplicateDiscordIdCount > 1 ? duplicateDiscordIdCount : 0,
          eventsPlayed,
        };
      })
    );
    
    return enrichedPlayers;
  },
});

export const backfillPlayerEventParticipationStats = mutation({
  args: {
    playerId: v.optional(v.id("players")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const players = args.playerId
      ? [await ctx.db.get(args.playerId)].filter((player) => player !== null)
      : await ctx.db.query("players").collect();

    let updated = 0;
    for (const player of players) {
      const eventResults = await ctx.db
        .query("eventResults")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      const thirdPartyResults = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();

      const uniqueEventNames = new Set([
        ...eventResults.map((e) => e.eventName),
        ...thirdPartyResults.map((e) => e.eventName),
      ]);

      let lastEventDate: string | undefined;
      for (const result of eventResults) {
        if (result.eventDate && (!lastEventDate || result.eventDate > lastEventDate)) {
          lastEventDate = result.eventDate;
        }
      }
      for (const result of thirdPartyResults) {
        const importRecord = await ctx.db.get(result.importId);
        const eventDate = importRecord?.eventDate;
        if (eventDate && (!lastEventDate || eventDate > lastEventDate)) {
          lastEventDate = eventDate;
        }
      }

      await ctx.db.patch(player._id, {
        eventsPlayedCount: uniqueEventNames.size,
        lastEventDate,
      });
      updated++;
    }

    return { updated };
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

    const players = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) =>
        q.eq("currentMembershipStatus", "accepted"),
      )
      .order("desc")
      .collect();

    return players
      .filter((player) => {
        const epic = player.epicUsername.toLowerCase();
        const discord = player.discordUsername.toLowerCase();
        const discordId = player.discordUserId?.toLowerCase() ?? "";
        return (
          epic.includes(needle) ||
          discord.includes(needle) ||
          discordId.includes(needle)
        );
      })
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

    const allPlayers = await ctx.db
      .query("players")
      .order("desc")
      .collect();

    // Return only the fields the Discord Members page needs
    return allPlayers.map((player) => ({
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
          
          // Update player with tier and total score
          await ctx.db.patch(playerId, {
            totalScore,
            tier,
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

export const mergePlayers = mutation({
  args: {
    primaryPlayerId: v.id("players"),
    secondaryPlayerId: v.id("players"),
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
    
    // Merge data - prefer real data over placeholders
    const isPlaceholderId = (id: string) => id.startsWith("placeholder_") || id === "imported";
    
    const mergedData = {
      discordUsername: primaryPlayer.discordUsername,
      nickname: primaryPlayer.nickname || secondaryPlayer.nickname,
      discordUserId: isPlaceholderId(primaryPlayer.discordUserId) && !isPlaceholderId(secondaryPlayer.discordUserId)
        ? secondaryPlayer.discordUserId
        : primaryPlayer.discordUserId,
      serverJoinDate: primaryPlayer.serverJoinDate || secondaryPlayer.serverJoinDate,
      epicUsername: primaryPlayer.epicUsername,
      twitterUsername: primaryPlayer.twitterUsername || secondaryPlayer.twitterUsername,
      twitchUsername: primaryPlayer.twitchUsername || secondaryPlayer.twitchUsername,
      youtubeUsername: primaryPlayer.youtubeUsername || secondaryPlayer.youtubeUsername,
      adminComments: [primaryPlayer.adminComments, secondaryPlayer.adminComments]
        .filter(Boolean)
        .join(" | "),
      discordRoles: primaryPlayer.discordRoles || secondaryPlayer.discordRoles,
      // Prefer primary tier/score, but fallback to secondary
      tier: primaryPlayer.tier || secondaryPlayer.tier,
      totalScore: primaryPlayer.totalScore ?? secondaryPlayer.totalScore,
      status: primaryPlayer.status || secondaryPlayer.status,
    };
    
    // Update primary player with merged data
    await ctx.db.patch(args.primaryPlayerId, mergedData);
    
    // Migrate scores from secondary to primary (if secondary has scores and primary doesn't)
    const primaryScore = await ctx.db
      .query("manualScores")
      .withIndex("by_player", (q) => q.eq("playerId", args.primaryPlayerId))
      .first();
    
    const secondaryScore = await ctx.db
      .query("manualScores")
      .withIndex("by_player", (q) => q.eq("playerId", args.secondaryPlayerId))
      .first();
    
    if (secondaryScore && !primaryScore) {
      // Copy secondary score to primary
      await ctx.db.insert("manualScores", {
        ...secondaryScore,
        playerId: args.primaryPlayerId,
        evaluatedBy: user._id,
      });
    }
    
    // Migrate tier history from secondary to primary
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
    
    // Delete secondary player's scores
    if (secondaryScore) {
      await ctx.db.delete(secondaryScore._id);
    }
    
    // Delete secondary player's tier history
    for (const history of secondaryTierHistory) {
      await ctx.db.delete(history._id);
    }
    
    // Delete secondary player
    await ctx.db.delete(args.secondaryPlayerId);
    
    // Log audit
    await logAudit(ctx, {
      userId: user._id,
      userName: getDisplayName(user),
      action: "players_merged",
      entityType: "player",
      entityId: args.primaryPlayerId,
      details: `Merged ${secondaryPlayer.discordUsername} (${secondaryPlayer.epicUsername}) into ${primaryPlayer.discordUsername} (${primaryPlayer.epicUsername})`,
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
