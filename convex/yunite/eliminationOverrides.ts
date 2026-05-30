import { mutation, query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireAdmin, getDisplayName } from "../auth_helpers";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel.d.ts";

// Get all overrides for a specific match
export const getMatchOverrides = internalQuery({
  args: {
    importId: v.id("thirdPartyImports"),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const overrides = await ctx.db
      .query("matchEliminationOverrides")
      .withIndex("by_match", (q) =>
        q.eq("importId", args.importId).eq("sessionId", args.sessionId)
      )
      .collect();
    
    // Return a map for quick lookup
    const overrideMap: Record<string, number> = {};
    for (const override of overrides) {
      overrideMap[override.discordId] = override.eliminations;
    }
    return overrideMap;
  },
});

// Set elimination override for a player in a match
export const setEliminationOverride = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    sessionId: v.string(),
    discordId: v.string(),
    eliminations: v.number(),
    teamKills: v.number(), // API team kills limit
    teamPlayers: v.array(v.object({
      discordId: v.string(),
      currentEliminations: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    // Validate the new value
    if (args.eliminations < 0) {
      throw new Error("Eliminations cannot be negative");
    }
    
    // Calculate what the new team total would be
    let newTeamTotal = 0;
    for (const player of args.teamPlayers) {
      if (player.discordId === args.discordId) {
        newTeamTotal += args.eliminations; // Use the new value for this player
      } else {
        newTeamTotal += player.currentEliminations; // Use current value for others
      }
    }
    
    // Validate against team kills limit
    if (newTeamTotal > args.teamKills) {
      throw new Error(
        `Team total (${newTeamTotal}) would exceed API team kills (${args.teamKills}). Maximum allowed for this player is ${args.teamKills - (newTeamTotal - args.eliminations)}.`
      );
    }
    
    // Check if an override already exists
    const existing = await ctx.db
      .query("matchEliminationOverrides")
      .withIndex("by_player", (q) =>
        q.eq("importId", args.importId)
          .eq("sessionId", args.sessionId)
          .eq("discordId", args.discordId)
      )
      .first();
    
    if (existing) {
      // Update existing override
      await ctx.db.patch(existing._id, {
        eliminations: args.eliminations,
        editedBy: user._id,
        editedByName: getDisplayName(user),
      });
    } else {
      // Create new override
      await ctx.db.insert("matchEliminationOverrides", {
        importId: args.importId,
        sessionId: args.sessionId,
        discordId: args.discordId,
        eliminations: args.eliminations,
        editedBy: user._id,
        editedByName: getDisplayName(user),
      });
    }
    
    // Log to audit
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userName: getDisplayName(user),
      action: "match_elimination_override",
      entityType: "matchEliminationOverride",
      details: JSON.stringify({
        importId: args.importId,
        sessionId: args.sessionId,
        discordId: args.discordId,
        eliminations: args.eliminations,
        newTeamTotal,
        teamKillsLimit: args.teamKills,
      }),
    });
    
    // Recalculate player stats to update their total eliminations
    await ctx.scheduler.runAfter(0, internal.yunite.recalculateStats.recalculatePlayerStats, {
      importId: args.importId,
      discordId: args.discordId,
    });
    
    return {
      success: true,
      newTeamTotal,
    };
  },
});

// Delete elimination override (revert to calculated value)
export const deleteEliminationOverride = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    sessionId: v.string(),
    discordId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    const existing = await ctx.db
      .query("matchEliminationOverrides")
      .withIndex("by_player", (q) =>
        q.eq("importId", args.importId)
          .eq("sessionId", args.sessionId)
          .eq("discordId", args.discordId)
      )
      .first();
    
    if (existing) {
      await ctx.db.delete(existing._id);
      
      // Log to audit
      await ctx.db.insert("auditLogs", {
        userId: user._id,
        userName: getDisplayName(user),
        action: "match_elimination_override_deleted",
        entityType: "matchEliminationOverride",
        details: JSON.stringify({
          importId: args.importId,
          sessionId: args.sessionId,
          discordId: args.discordId,
        }),
      });
      
      // Recalculate player stats to update their total eliminations
      await ctx.scheduler.runAfter(0, internal.yunite.recalculateStats.recalculatePlayerStats, {
        importId: args.importId,
        discordId: args.discordId,
      });
    }
    
    return { success: true };
  },
});
