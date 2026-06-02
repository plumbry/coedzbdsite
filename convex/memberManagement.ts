import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { requireAdmin, getDisplayName } from "./auth_helpers";
import type { Id } from "./_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";

// Search players to link a returning member's application (accepted, former, rejected)
export const searchPlayersForApplicationLink = query({
  args: {
    search: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const needle = args.search.trim().toLowerCase();
    const maxResults = Math.min(args.limit ?? 50, 50);
    if (needle.length < 2) {
      return [];
    }

    const players = await ctx.db.query("players").order("desc").collect();

    return players
      .filter((player) => {
        const status = player.currentMembershipStatus;
        if (
          status !== "accepted" &&
          status !== "former" &&
          status !== "rejected"
        ) {
          return false;
        }
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
        currentMembershipStatus: player.currentMembershipStatus,
        tier: player.tier,
      }));
  },
});

// Submit new application
export const submitApplication = mutation({
  args: {
    discordUsername: v.string(),
    epicUsername: v.string(),
    existingPlayerId: v.optional(v.id("players")),
  },
  handler: async (ctx, args): Promise<Id<"applications">> => {
    await requireAdmin(ctx);
    
    const fortniteProfileLink = `https://fortnitetracker.com/profile/all/${encodeURIComponent(args.epicUsername)}`;
    
    // Use empty string for discordId — will be linked automatically in the future
    let discordId = "";
    let linkedPlayerId: Id<"players"> | undefined;
    let isPreviouslyApplied = false;
    let isPreviouslyAccepted = false;
    let isFormerMember = false;

    if (args.existingPlayerId) {
      const existingPlayer = await ctx.db.get(args.existingPlayerId);
      if (!existingPlayer) {
        throw new ConvexError({
          message: "Selected member not found",
          code: "NOT_FOUND",
        });
      }

      linkedPlayerId = existingPlayer._id;
      discordId = existingPlayer.discordUserId ?? "";

      const priorApplications = await ctx.db
        .query("applications")
        .withIndex("by_player_id", (q) => q.eq("playerId", existingPlayer._id))
        .collect();

      isPreviouslyApplied = priorApplications.length > 0;
      isPreviouslyAccepted =
        existingPlayer.currentMembershipStatus === "accepted" ||
        existingPlayer.currentMembershipStatus === "former" ||
        priorApplications.some((app) => app.status === "accepted");
      isFormerMember = existingPlayer.currentMembershipStatus === "former";

      const pendingForPlayer = priorApplications.find(
        (app) => app.status === "pending",
      );
      if (pendingForPlayer) {
        throw new ConvexError({
          message: "This member already has a pending application",
          code: "CONFLICT",
        });
      }

      await ctx.db.patch(existingPlayer._id, {
        discordUsername: args.discordUsername,
        epicUsername: args.epicUsername,
      });
    }
    
    // Check for existing pending application by discord username
    const existingPending = await ctx.db
      .query("applications")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => q.eq(q.field("discordUsername"), args.discordUsername))
      .first();
    
    if (existingPending) {
      throw new ConvexError({
        message: "A pending application already exists for this Discord username",
        code: "CONFLICT",
      });
    }
    
    // Create application
    const applicationId = await ctx.db.insert("applications", {
      discordUsername: args.discordUsername,
      discordId,
      fortniteProfileLink,
      status: "pending",
      isPreviouslyApplied: linkedPlayerId ? true : isPreviouslyApplied,
      isPreviouslyAccepted,
      isFormerMember,
      playerId: linkedPlayerId,
    });
    
    // Log status event
    await ctx.db.insert("statusEvents", {
      entityType: "application",
      entityId: applicationId,
      discordId,
      discordUsername: args.discordUsername,
      newStatus: "pending",
      action: "submitted",
      isSystemAction: false,
    });
    
    return applicationId;
  },
});

// Get pending applications
export const getPendingApplications = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();
    
    // Get evaluation scores for each
    const applicationsWithScores = await Promise.all(
      applications.map(async (app) => {
        let evaluation = null;
        if (app.playerId) {
          evaluation = await ctx.db
            .query("manualScores")
            .withIndex("by_player", (q) => q.eq("playerId", app.playerId!))
            .first();
        }
        
        return {
          ...app,
          evaluation,
        };
      })
    );
    
    return applicationsWithScores;
  },
});

// Get application history for a Discord ID
export const getApplicationHistory = query({
  args: { discordId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .order("desc")
      .collect();
    
    // Get evaluations for each
    const applicationsWithEvaluations = await Promise.all(
      applications.map(async (app) => {
        let evaluation = null;
        if (app.playerId) {
          evaluation = await ctx.db
            .query("manualScores")
            .withIndex("by_player", (q) => q.eq("playerId", app.playerId!))
            .first();
        }
        
        return {
          ...app,
          evaluation,
        };
      })
    );
    
    return applicationsWithEvaluations;
  },
});

// Update application notes
export const updateApplicationNotes = mutation({
  args: {
    applicationId: v.id("applications"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    await ctx.db.patch(args.applicationId, {
      notes: args.notes,
    });
  },
});

// Update application details
export const updateApplication = mutation({
  args: {
    applicationId: v.id("applications"),
    discordUsername: v.string(),
    epicUsername: v.string(),
    discordId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const application = await ctx.db.get(args.applicationId);
    if (!application) {
      throw new ConvexError({
        message: "Application not found",
        code: "NOT_FOUND",
      });
    }
    
    const fortniteProfileLink = `https://fortnitetracker.com/profile/all/${encodeURIComponent(args.epicUsername)}`;
    
    const updateData: Record<string, string> = {
      discordUsername: args.discordUsername,
      fortniteProfileLink,
    };
    
    if (args.discordId !== undefined) {
      updateData.discordId = args.discordId;
    }
    
    await ctx.db.patch(args.applicationId, updateData);
  },
});

// Delete application
export const deleteApplication = mutation({
  args: {
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const application = await ctx.db.get(args.applicationId);
    if (!application) {
      throw new ConvexError({
        message: "Application not found",
        code: "NOT_FOUND",
      });
    }
    
    // If player exists and application was never accepted, delete the player record too
    if (application.playerId && application.status === "pending") {
      await ctx.db.delete(application.playerId);
      
      // Also delete any evaluation scores
      const scores = await ctx.db
        .query("manualScores")
        .withIndex("by_player", (q) => q.eq("playerId", application.playerId!))
        .collect();
      
      for (const score of scores) {
        await ctx.db.delete(score._id);
      }
    }
    
    // Delete the application
    await ctx.db.delete(args.applicationId);
    
    // Log status event
    await ctx.db.insert("statusEvents", {
      entityType: "application",
      entityId: args.applicationId,
      discordId: application.discordId,
      discordUsername: application.discordUsername,
      previousStatus: application.status,
      newStatus: "deleted",
      action: "deleted",
      isSystemAction: false,
    });
  },
});

// Accept application
export const acceptApplication = mutation({
  args: {
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "Unauthorized",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (!user) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }
    
    const application = await ctx.db.get(args.applicationId);
    if (!application) {
      throw new ConvexError({
        message: "Application not found",
        code: "NOT_FOUND",
      });
    }
    
    // Check if player already exists
    let playerId = application.playerId;
    
    if (!playerId) {
      // Check for existing player by Discord ID (only if discordId is non-empty)
      let existingPlayer = null;
      if (application.discordId && application.discordId.trim() !== "") {
        existingPlayer = await ctx.db
          .query("players")
          .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", application.discordId))
          .first();
      }
      
      if (existingPlayer) {
        playerId = existingPlayer._id;
        // Update existing player
        await ctx.db.patch(existingPlayer._id, {
          currentMembershipStatus: "accepted",
          status: "active",
        });
      } else {
        // Create new player
        playerId = await ctx.db.insert("players", {
          discordUsername: application.discordUsername,
          discordUserId: application.discordId,
          epicUsername: application.fortniteProfileLink.split("/").pop() || application.discordUsername,
          serverJoinDate: new Date().toISOString(),
          currentMembershipStatus: "accepted",
          status: "active",
          matchConfidence: "manual",
        });
      }
    } else {
      // Player exists (created for evaluation), update status to accepted
      await ctx.db.patch(playerId, {
        currentMembershipStatus: "accepted",
        status: "active",
      });
    }
    
    // Update application
    await ctx.db.patch(args.applicationId, {
      status: "accepted",
      acceptedAt: Date.now(),
      autoAcceptedByDiscordSync: false,
      playerId,
      processedBy: user._id,
      processedByName: getDisplayName(user),
    });
    
    // Log status event
    await ctx.db.insert("statusEvents", {
      entityType: "application",
      entityId: args.applicationId,
      discordId: application.discordId,
      discordUsername: application.discordUsername,
      previousStatus: "pending",
      newStatus: "accepted",
      action: "accepted",
      performedBy: user._id,
      performedByName: getDisplayName(user),
      isSystemAction: false,
    });
    
    return playerId;
  },
});

// Reject application
export const rejectApplication = mutation({
  args: {
    applicationId: v.id("applications"),
    rejectionReason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "Unauthorized",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (!user) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }
    
    const application = await ctx.db.get(args.applicationId);
    if (!application) {
      throw new ConvexError({
        message: "Application not found",
        code: "NOT_FOUND",
      });
    }
    
    // Update application
    await ctx.db.patch(args.applicationId, {
      status: "rejected",
      rejectedAt: Date.now(),
      rejectionReason: args.rejectionReason,
      processedBy: user._id,
      processedByName: getDisplayName(user),
    });
    
    // If player exists, mark as rejected and keep the rejection status
    if (application.playerId) {
      await ctx.db.patch(application.playerId, {
        currentMembershipStatus: "rejected",
        status: "rejected",
        rejectionReason: args.rejectionReason,
      });
    }
    
    // Log status event
    await ctx.db.insert("statusEvents", {
      entityType: "application",
      entityId: args.applicationId,
      discordId: application.discordId,
      discordUsername: application.discordUsername,
      previousStatus: "pending",
      newStatus: "rejected",
      action: "rejected",
      reason: args.rejectionReason,
      performedBy: user._id,
      performedByName: getDisplayName(user),
      isSystemAction: false,
    });
  },
});

// Create player record for application (for evaluation before acceptance)
export const createPlayerForApplication = mutation({
  args: {
    applicationId: v.id("applications"),
  },
  handler: async (ctx, args): Promise<Id<"players">> => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "Unauthorized",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (!user) {
      throw new ConvexError({
        message: "User not found",
        code: "NOT_FOUND",
      });
    }
    
    const application = await ctx.db.get(args.applicationId);
    if (!application) {
      throw new ConvexError({
        message: "Application not found",
        code: "NOT_FOUND",
      });
    }
    
    // If player already exists, return it
    if (application.playerId) {
      return application.playerId;
    }
    
    // Check for existing player by Discord ID (only if discordId is non-empty)
    if (application.discordId && application.discordId.trim() !== "") {
      const existingPlayer = await ctx.db
        .query("players")
        .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", application.discordId))
        .first();
      
      if (existingPlayer) {
        // Link existing player to application
        await ctx.db.patch(args.applicationId, {
          playerId: existingPlayer._id,
        });
        return existingPlayer._id;
      }
    }
    
    // Extract Epic username from Fortnite link (or use Discord username as fallback)
    let epicUsername = application.discordUsername;
    try {
      const url = new URL(application.fortniteProfileLink);
      const pathParts = url.pathname.split("/").filter(p => p.length > 0);
      if (pathParts.length > 0) {
        epicUsername = pathParts[pathParts.length - 1];
      }
    } catch {
      // If URL parsing fails, use Discord username
      epicUsername = application.discordUsername;
    }
    
    // Create temporary player record for evaluation
    const playerId = await ctx.db.insert("players", {
      discordUsername: application.discordUsername,
      discordUserId: application.discordId,
      epicUsername,
      serverJoinDate: new Date().toISOString(),
      currentMembershipStatus: "rejected", // Temporary status, will be updated on acceptance
      status: "rejected",
      matchConfidence: "manual",
    });
    
    // Link player to application
    await ctx.db.patch(args.applicationId, {
      playerId,
    });
    
    return playerId;
  },
});

// Get accepted members (public + admin)
export const getAcceptedMembers = query({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .order("desc")
      .collect();

    const enriched = await Promise.all(
      players.map(async (player) => {
        const score = await ctx.db
          .query("manualScores")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .first();

        const latestApplication = await ctx.db
          .query("applications")
          .withIndex("by_player_id", (q) => q.eq("playerId", player._id))
          .order("desc")
          .first();

        return {
          ...player,
          gender: score?.gender,
          isActive: player.isRecentlyActive ?? false,
          autoAcceptedByDiscordSync: latestApplication?.autoAcceptedByDiscordSync ?? false,
        };
      }),
    );

    return enriched;
  },
});

// Slim public member directory (home page) — no admin-only fields
export const getPublicMemberDirectory = query({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .order("desc")
      .collect();

    return await Promise.all(
      players.map(async (player) => {
        const score = await ctx.db
          .query("manualScores")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .first();

        return {
          _id: player._id,
          discordUsername: player.discordUsername,
          epicUsername: player.epicUsername,
          nickname: player.nickname,
          tier: player.tier,
          avatarUrl: player.avatarUrl,
          totalScore: player.totalScore,
          gender: score?.gender,
          isActive: player.isRecentlyActive ?? false,
        };
      }),
    );
  },
});

// Refresh cached isRecentlyActive flags (cron / post-import)
export const refreshRecentlyActiveFlags = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sixWeeksAgo = new Date(Date.now() - 6 * 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const recentEvents = await ctx.db
      .query("events")
      .withIndex("by_date")
      .filter((q) => q.gte(q.field("startDate"), sixWeeksAgo))
      .collect();

    const recentEventIds = new Set(recentEvents.map((e) => e._id));
    const recentImportIds = new Set<Id<"thirdPartyImports">>();

    for (const eventId of recentEventIds) {
      const imports = await ctx.db
        .query("thirdPartyImports")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
      for (const imp of imports) {
        recentImportIds.add(imp._id);
      }
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .collect();

    for (const player of players) {
      let isActive = false;
      if (recentImportIds.size > 0) {
        const playerMatches = await ctx.db
          .query("matchPlayerStats")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .order("desc")
          .take(30);
        isActive = playerMatches.some((m) => recentImportIds.has(m.importId));
      }
      if (player.isRecentlyActive !== isActive) {
        await ctx.db.patch(player._id, { isRecentlyActive: isActive });
      }
    }
  },
});

// Admin: refresh isRecentlyActive flags immediately (also runs daily via cron)
export const triggerRefreshRecentlyActive = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.memberManagement.refreshRecentlyActiveFlags, {});
  },
});

// Get rejected members
export const getRejectedMembers = query({
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

    return rejectedPlayers;
  },
});

// Get former members (public)
export const getFormerMembers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "former"))
      .order("desc")
      .collect();
  },
});

// Get Discord members (synced but not evaluated)
export const getDiscordMembers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    
    return await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "discord_member"))
      .order("desc")
      .collect();
  },
});

// Get status history for a Discord ID
export const getStatusHistory = query({
  args: { discordId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    return await ctx.db
      .query("statusEvents")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .order("desc")
      .collect();
  },
});

// Update former member profile and archive reason
export const updateFormerMember = mutation({
  args: {
    playerId: v.id("players"),
    discordUsername: v.string(),
    nickname: v.optional(v.string()),
    discordUserId: v.string(),
    serverJoinDate: v.string(),
    epicUsername: v.string(),
    twitterUsername: v.optional(v.string()),
    twitchUsername: v.optional(v.string()),
    youtubeUsername: v.optional(v.string()),
    adminComments: v.optional(v.string()),
    archiveReason: v.union(
      v.literal("left server"),
      v.literal("application incomplete"),
      v.literal("no tier role"),
      v.literal("banned"),
      v.literal("other")
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }
    
    // Update player
    await ctx.db.patch(args.playerId, {
      discordUsername: args.discordUsername,
      nickname: args.nickname,
      discordUserId: args.discordUserId,
      serverJoinDate: args.serverJoinDate,
      epicUsername: args.epicUsername,
      twitterUsername: args.twitterUsername,
      twitchUsername: args.twitchUsername,
      youtubeUsername: args.youtubeUsername,
      adminComments: args.adminComments,
      archiveReason: args.archiveReason,
      hasLeftServer: false, // Clear the auto-archived flag when admin updates
    });
    
    // Log audit trail
    await ctx.db.insert("statusEvents", {
      entityType: "member",
      entityId: args.playerId,
      discordId: args.discordUserId,
      discordUsername: args.discordUsername,
      newStatus: "former",
      action: "updated",
      reason: `Updated profile and archive reason: ${args.archiveReason}`,
      isSystemAction: false,
    });
  },
});

// Move former member to rejected status
export const rejectFormerMember = mutation({
  args: {
    playerId: v.id("players"),
    rejectionReason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }
    
    if (player.currentMembershipStatus !== "former") {
      throw new ConvexError({
        message: "Can only reject former members",
        code: "BAD_REQUEST",
      });
    }
    
    // Update player status to rejected
    await ctx.db.patch(args.playerId, {
      status: "rejected",
      currentMembershipStatus: "rejected",
      rejectionReason: args.rejectionReason,
      archiveReason: undefined, // Clear archive reason when moving to rejected
      hasLeftServer: false, // Clear left server flag
    });
    
    // Log audit trail
    await ctx.db.insert("statusEvents", {
      entityType: "member",
      entityId: args.playerId,
      discordId: player.discordUserId,
      discordUsername: player.discordUsername,
      previousStatus: "former",
      newStatus: "rejected",
      action: "rejected",
      reason: args.rejectionReason,
      isSystemAction: false,
    });
  },
});

// Update member status and profile (works for accepted/former/rejected)
export const updateMemberStatus = mutation({
  args: {
    playerId: v.id("players"),
    discordUsername: v.string(),
    nickname: v.optional(v.string()),
    discordUserId: v.string(),
    serverJoinDate: v.string(),
    epicUsername: v.string(),
    twitterUsername: v.optional(v.string()),
    twitchUsername: v.optional(v.string()),
    youtubeUsername: v.optional(v.string()),
    adminComments: v.optional(v.string()),
    status: v.union(
      v.literal("accepted"),
      v.literal("former"),
      v.literal("rejected")
    ),
    archiveReason: v.optional(v.union(
      v.literal("left server"),
      v.literal("application incomplete"),
      v.literal("no tier role"),
      v.literal("banned"),
      v.literal("other")
    )),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }
    
    const previousStatus = player.currentMembershipStatus || "accepted";
    
    // Build update object based on status
    const updateData: Record<string, unknown> = {
      discordUsername: args.discordUsername,
      nickname: args.nickname,
      discordUserId: args.discordUserId,
      serverJoinDate: args.serverJoinDate,
      epicUsername: args.epicUsername,
      twitterUsername: args.twitterUsername,
      twitchUsername: args.twitchUsername,
      youtubeUsername: args.youtubeUsername,
      adminComments: args.adminComments,
      hasLeftServer: false, // Clear auto-archive flag when admin updates
    };
    
    // Set status fields based on new status
    if (args.status === "accepted") {
      updateData.status = "active";
      updateData.currentMembershipStatus = "accepted";
      updateData.archiveReason = undefined;
      updateData.rejectionReason = undefined;
    } else if (args.status === "former") {
      updateData.status = "archived";
      updateData.currentMembershipStatus = "former";
      updateData.archiveReason = args.archiveReason || "other";
      updateData.rejectionReason = undefined;
    } else if (args.status === "rejected") {
      updateData.status = "rejected";
      updateData.currentMembershipStatus = "rejected";
      updateData.rejectionReason = args.rejectionReason || "No reason provided";
      updateData.archiveReason = undefined;
    }
    
    await ctx.db.patch(args.playerId, updateData);
    
    // Log audit trail
    await ctx.db.insert("statusEvents", {
      entityType: "member",
      entityId: args.playerId,
      discordId: args.discordUserId,
      discordUsername: args.discordUsername,
      previousStatus,
      newStatus: args.status,
      action: "status-changed",
      reason: args.status === "former" 
        ? `Status changed to former (${args.archiveReason})`
        : args.status === "rejected"
        ? `Status changed to rejected (${args.rejectionReason})`
        : "Status changed to accepted",
      isSystemAction: false,
    });
  },
});

// Delete a player and all associated data
export const deletePlayer = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new ConvexError({
        message: "Player not found",
        code: "NOT_FOUND",
      });
    }
    
    // Delete all manual scores
    const manualScores = await ctx.db
      .query("manualScores")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    for (const score of manualScores) {
      await ctx.db.delete(score._id);
    }
    
    // Delete all applications
    const applications = await ctx.db
      .query("applications")
      .filter((q) => q.eq(q.field("playerId"), args.playerId))
      .collect();
    for (const app of applications) {
      await ctx.db.delete(app._id);
    }
    
    // Delete all status events
    const statusEvents = await ctx.db
      .query("statusEvents")
      .filter((q) => 
        q.and(
          q.eq(q.field("entityType"), "member"),
          q.eq(q.field("entityId"), args.playerId)
        )
      )
      .collect();
    for (const event of statusEvents) {
      await ctx.db.delete(event._id);
    }
    
    // Delete all match player stats
    const matchPlayerStats = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    for (const stat of matchPlayerStats) {
      await ctx.db.delete(stat._id);
    }
    
    // Delete all player earnings
    const earnings = await ctx.db
      .query("playerEarnings")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    for (const earning of earnings) {
      await ctx.db.delete(earning._id);
    }
    
    // Delete tier history
    const tierHistory = await ctx.db
      .query("tierHistory")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    for (const history of tierHistory) {
      await ctx.db.delete(history._id);
    }
    
    // Finally, delete the player
    await ctx.db.delete(args.playerId);
    
    // Log deletion
    await ctx.db.insert("statusEvents", {
      entityType: "member",
      entityId: args.playerId,
      discordId: player.discordUserId,
      discordUsername: player.discordUsername,
      previousStatus: player.currentMembershipStatus || "accepted",
      newStatus: "deleted",
      action: "deleted",
      reason: "Player and all associated data permanently deleted by admin",
      isSystemAction: false,
    });
  },
});

// Internal query for HTTP endpoint - get member by Discord ID
export const getMemberByDiscordId = internalQuery({
  args: { discordId: v.string() },
  handler: async (ctx, args): Promise<{ tier: string | undefined; evaluationGender: number | undefined } | null> => {
    // First, try to look up player by primary Discord ID
    let player = await ctx.db
      .query("players")
      .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", args.discordId))
      .first();
    
    // If not found, check alternate Discord IDs
    if (!player) {
      // Need to scan for alternate IDs since there's no index on alternateDiscordUserIds
      const allPlayers = await ctx.db.query("players").collect();
      player = allPlayers.find(p => 
        p.alternateDiscordUserIds?.includes(args.discordId)
      ) || null;
    }
    
    if (!player) {
      return null;
    }
    
    // Get evaluation scores for the player
    const evaluation = await ctx.db
      .query("manualScores")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .first();
    
    return {
      tier: player.tier,
      evaluationGender: evaluation?.gender,
    };
  },
});
