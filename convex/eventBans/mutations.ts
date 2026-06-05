import { internalMutation, mutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import {
  getCurrentUser,
  getDisplayName,
  requireAdmin,
  requireEventBanWriteAccess,
} from "../auth_helpers";

const banValidator = v.object({
  discordId: v.string(),
  playerTag: v.string(),
  banType: v.string(),
  originalEvents: v.number(),
  remainingEvents: v.number(),
  startDate: v.string(),
  lastUpdated: v.string(),
  reason: v.string(),
  moderatorTag: v.string(),
  messageId: v.string(),
  status: v.string(),
  offenseTrack: v.optional(v.string()),
  offenseNumber: v.optional(v.number()),
});

export const upsertBan = internalMutation({
  args: {
    discordId: v.string(),
    playerTag: v.string(),
    banType: v.string(),
    originalEvents: v.number(),
    remainingEvents: v.number(),
    startDate: v.string(),
    lastUpdated: v.string(),
    reason: v.string(),
    moderatorTag: v.string(),
    messageId: v.string(),
    status: v.string(),
    offenseTrack: v.optional(v.string()),
    offenseNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Find existing ban by discordId + messageId combo (unique per ban entry)
    const existing = await ctx.db
      .query("eventBans")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .collect();

    // Match by messageId and startDate to uniquely identify a ban row
    const match = existing.find(
      (b) => b.messageId === args.messageId && b.startDate === args.startDate
    );

    if (match) {
      // Update existing
      await ctx.db.patch(match._id, {
        playerTag: args.playerTag,
        banType: args.banType,
        originalEvents: args.originalEvents,
        remainingEvents: args.remainingEvents,
        lastUpdated: args.lastUpdated,
        reason: args.reason,
        moderatorTag: args.moderatorTag,
        status: args.status,
        offenseTrack: args.offenseTrack,
        offenseNumber: args.offenseNumber,
      });
      return { action: "updated" as const, id: match._id };
    } else {
      // Insert new
      const id = await ctx.db.insert("eventBans", {
        discordId: args.discordId,
        playerTag: args.playerTag,
        banType: args.banType,
        originalEvents: args.originalEvents,
        remainingEvents: args.remainingEvents,
        startDate: args.startDate,
        lastUpdated: args.lastUpdated,
        reason: args.reason,
        moderatorTag: args.moderatorTag,
        messageId: args.messageId,
        status: args.status,
        offenseTrack: args.offenseTrack,
        offenseNumber: args.offenseNumber,
        syncedToDiscord: false,
        roleRemovedFromDiscord: false,
      });
      return { action: "inserted" as const, id };
    }
  },
});

// Batch upsert - processes all bans in a single transaction for speed
export const batchUpsertBans = internalMutation({
  args: {
    bans: v.array(banValidator),
  },
  handler: async (ctx, args): Promise<{ imported: number; updated: number }> => {
    let imported = 0;
    let updated = 0;

    // Load all existing bans once
    const allExisting = await ctx.db.query("eventBans").collect();

    for (const ban of args.bans) {
      // Match by discordId + messageId + startDate
      const match = allExisting.find(
        (b) =>
          b.discordId === ban.discordId &&
          b.messageId === ban.messageId &&
          b.startDate === ban.startDate
      );

      if (match) {
        await ctx.db.patch(match._id, {
          playerTag: ban.playerTag,
          banType: ban.banType,
          originalEvents: ban.originalEvents,
          remainingEvents: ban.remainingEvents,
          lastUpdated: ban.lastUpdated,
          reason: ban.reason,
          moderatorTag: ban.moderatorTag,
          status: ban.status,
          offenseTrack: ban.offenseTrack,
          offenseNumber: ban.offenseNumber,
        });
        updated++;
      } else {
        await ctx.db.insert("eventBans", {
          discordId: ban.discordId,
          playerTag: ban.playerTag,
          banType: ban.banType,
          originalEvents: ban.originalEvents,
          remainingEvents: ban.remainingEvents,
          startDate: ban.startDate,
          lastUpdated: ban.lastUpdated,
          reason: ban.reason,
          moderatorTag: ban.moderatorTag,
          messageId: ban.messageId,
          status: ban.status,
          offenseTrack: ban.offenseTrack,
          offenseNumber: ban.offenseNumber,
          syncedToDiscord: false,
          roleRemovedFromDiscord: false,
        });
        imported++;
      }
    }

    return { imported, updated };
  },
});

export const clearAllBans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allBans = await ctx.db.query("eventBans").collect();
    for (const ban of allBans) {
      await ctx.db.delete(ban._id);
    }
    return { deleted: allBans.length };
  },
});

function parseOffenseFromReason(
  reason: string,
  banType: string,
): { offenseTrack?: string; offenseNumber?: number } {
  const offenseMatch = reason.match(/\[(Minor|Major)\s+offense\s+#(\d+)\]/i);
  if (offenseMatch) {
    return {
      offenseTrack: offenseMatch[1].toLowerCase(),
      offenseNumber: parseInt(offenseMatch[2], 10),
    };
  }

  const banTypeLower = banType.trim().toLowerCase();
  if (banTypeLower === "probation") {
    return { offenseTrack: "probation" };
  }
  if (banTypeLower.startsWith("minor")) {
    return { offenseTrack: "minor" };
  }
  if (banTypeLower.startsWith("major")) {
    return { offenseTrack: "major" };
  }

  return {};
}

const sheetDateValidator = (value: string, field: string) => {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    throw new ConvexError({
      message: `${field} must be DD/MM/YYYY`,
      code: "BAD_REQUEST",
    });
  }
};

export const updateBanInternal = internalMutation({
  args: {
    banId: v.id("eventBans"),
    discordId: v.string(),
    playerTag: v.string(),
    banType: v.string(),
    originalEvents: v.number(),
    remainingEvents: v.number(),
    startDate: v.string(),
    lastUpdated: v.string(),
    reason: v.string(),
    moderatorTag: v.string(),
    status: v.string(),
    offenseTrack: v.optional(v.string()),
    offenseNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ban = await ctx.db.get(args.banId);
    if (!ban) {
      throw new ConvexError({
        message: "Ban not found",
        code: "NOT_FOUND",
      });
    }

    const discordId = args.discordId.trim();
    const playerTag = args.playerTag.trim();
    const banType = args.banType.trim();
    const reason = args.reason.trim();
    const moderatorTag = args.moderatorTag.trim();
    const startDate = args.startDate.trim();
    const lastUpdated = args.lastUpdated.trim();
    const status = args.status.trim().toUpperCase();

    if (!discordId || !playerTag || !banType || !reason || !moderatorTag) {
      throw new ConvexError({
        message: "Player, ban type, reason, and moderator are required",
        code: "BAD_REQUEST",
      });
    }

    if (args.originalEvents < 0 || args.remainingEvents < 0) {
      throw new ConvexError({
        message: "Event counts cannot be negative",
        code: "BAD_REQUEST",
      });
    }

    if (status !== "ACTIVE" && status !== "ENDED") {
      throw new ConvexError({
        message: 'Status must be "ACTIVE" or "ENDED"',
        code: "BAD_REQUEST",
      });
    }

    sheetDateValidator(startDate, "Start date");
    sheetDateValidator(lastUpdated, "Last updated");

    const parsedOffense = parseOffenseFromReason(reason, banType);
    const offenseTrack = args.offenseTrack?.trim() || parsedOffense.offenseTrack;
    const offenseNumber = args.offenseNumber ?? parsedOffense.offenseNumber;

    await ctx.db.patch(args.banId, {
      discordId,
      playerTag,
      banType,
      originalEvents: args.originalEvents,
      remainingEvents: args.remainingEvents,
      startDate,
      lastUpdated,
      reason,
      moderatorTag,
      status,
      offenseTrack,
      offenseNumber,
    });

    return {
      matchDiscordId: ban.discordId,
      messageId: ban.messageId,
      matchStartDate: ban.startDate,
      row: {
        discordId,
        playerTag,
        banType,
        originalEvents: args.originalEvents,
        remainingEvents: args.remainingEvents,
        startDate,
        lastUpdated,
        reason,
        moderatorTag,
        messageId: ban.messageId,
        status,
      },
    };
  },
});

// Delete a single ban by ID (used by the delete action)
export const deleteBanById = internalMutation({
  args: { banId: v.id("eventBans") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.banId);
  },
});

// Mark bans as synced to Discord after the bot has processed them
export const acknowledgeRoleSyncs = internalMutation({
  args: {
    banIds: v.array(v.id("eventBans")),
  },
  handler: async (ctx, args): Promise<{ acknowledged: number }> => {
    let acknowledged = 0;
    for (const banId of args.banIds) {
      const ban = await ctx.db.get(banId);
      if (ban && !ban.syncedToDiscord) {
        await ctx.db.patch(banId, { syncedToDiscord: true });
        acknowledged++;
      }
    }
    return { acknowledged };
  },
});

// Mark bans as having their role removed from Discord
export const acknowledgeRoleRemovals = internalMutation({
  args: {
    banIds: v.array(v.id("eventBans")),
  },
  handler: async (ctx, args): Promise<{ acknowledged: number }> => {
    let acknowledged = 0;
    for (const banId of args.banIds) {
      const ban = await ctx.db.get(banId);
      if (ban && !ban.roleRemovedFromDiscord) {
        await ctx.db.patch(banId, { roleRemovedFromDiscord: true });
        acknowledged++;
      }
    }
    return { acknowledged };
  },
});

// Queue a role removal for a ban that is about to be deleted
export const queuePendingRoleRemoval = internalMutation({
  args: {
    discordId: v.string(),
    banType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("pendingRoleRemovals", {
      discordId: args.discordId,
      banType: args.banType,
    });
  },
});

// Acknowledge (delete) queued pending role removals after the bot has processed them
export const acknowledgePendingRoleRemovals = internalMutation({
  args: {
    ids: v.array(v.id("pendingRoleRemovals")),
  },
  handler: async (ctx, args): Promise<{ acknowledged: number }> => {
    let acknowledged = 0;
    for (const id of args.ids) {
      const doc = await ctx.db.get(id);
      if (doc) {
        await ctx.db.delete(id);
        acknowledged++;
      }
    }
    return { acknowledged };
  },
});

export const deletePlayerOffensesInternal = internalMutation({
  args: {
    discordId: v.string(),
    track: v.optional(v.string()), // "minor", "major", or undefined for all
  },
  handler: async (ctx, args): Promise<{ deleted: number }> => {
    const bans = await ctx.db
      .query("eventBans")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .collect();

    let deleted = 0;
    for (const ban of bans) {
      if (!ban.offenseTrack) continue;
      if (args.track && ban.offenseTrack !== args.track) continue;
      await ctx.db.delete(ban._id);
      deleted++;
    }

    return { deleted };
  },
});

// Create a new ban directly from the admin panel
export const createBan = mutation({
  args: {
    discordId: v.string(),
    playerTag: v.string(),
    banType: v.string(),
    originalEvents: v.number(),
    reason: v.string(),
    offenseTrack: v.optional(v.string()),
    offenseNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireEventBanWriteAccess(ctx);

    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

    // Generate a unique messageId for web-created bans
    const messageId = `WEB_${Date.now()}`;

    const moderatorTag = getDisplayName(user);

    const isProbation =
      args.banType === "Probation" || args.offenseTrack === "probation";

    const id = await ctx.db.insert("eventBans", {
      discordId: args.discordId,
      playerTag: args.playerTag,
      banType: args.banType,
      originalEvents: args.originalEvents,
      remainingEvents: args.originalEvents,
      startDate: todayStr,
      lastUpdated: todayStr,
      reason: args.reason,
      moderatorTag,
      messageId,
      // Warnings (0 events) end immediately; probation stays active for role sync
      status:
        isProbation ? "ACTIVE" : args.originalEvents === 0 ? "ENDED" : "ACTIVE",
      offenseTrack: args.offenseTrack,
      offenseNumber: args.offenseNumber,
      syncedToDiscord: false,
      roleRemovedFromDiscord: false,
    });

    // Log to Mod Log Google Sheet
    await ctx.scheduler.runAfter(0, api.googleSheets.logBanToModLog, {
      playerTag: args.playerTag,
      discordId: args.discordId,
      banType: args.banType,
      originalEvents: args.originalEvents,
      reason: args.reason,
      moderatorTag,
      offenseTrack: args.offenseTrack,
      offenseNumber: args.offenseNumber,
      date: todayStr,
    });

    return { id };
  },
});

// Simulates /eventban eventpassed — decrements remainingEvents by count for all active bans
// and ends any that reach 0
export const eventPassed = mutation({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ decremented: number; ended: number }> => {
    const user = await requireEventBanWriteAccess(ctx);
    const identity = await ctx.auth.getUserIdentity();

    const count = args.count ?? 1;

    const activeBans = await ctx.db
      .query("eventBans")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();

    let decremented = 0;
    let ended = 0;

    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

    // Collect bans that will be ended so we can update the sheet
    const endedBans: Array<{ discordId: string; messageId: string; startDate: string }> = [];

    for (const ban of activeBans) {
      const newRemaining = Math.max(0, ban.remainingEvents - count);
      if (newRemaining === 0) {
        await ctx.db.patch(ban._id, {
          remainingEvents: 0,
          status: "ENDED",
          lastUpdated: todayStr,
        });
        endedBans.push({
          discordId: ban.discordId,
          messageId: ban.messageId,
          startDate: ban.startDate,
        });
        ended++;
      } else {
        await ctx.db.patch(ban._id, {
          remainingEvents: newRemaining,
          lastUpdated: todayStr,
        });
        decremented++;
      }
    }

    // Track when event passed was last used
    const nowISO = new Date().toISOString();
    const existingMeta = await ctx.db.query("eventBansMetadata").first();
    const passedBy =
      identity?.name ?? identity?.email ?? getDisplayName(user);
    if (existingMeta) {
      await ctx.db.patch(existingMeta._id, {
        lastEventPassedAt: nowISO,
        lastEventPassedBy: passedBy,
      });
    } else {
      await ctx.db.insert("eventBansMetadata", {
        lastEventPassedAt: nowISO,
        lastEventPassedBy: passedBy,
      });
    }

    // Schedule sheet update for ended bans (runs as a Node action)
    if (endedBans.length > 0) {
      await ctx.scheduler.runAfter(0, internal.eventBans.sync.updateSheetBansToEnded, {
        bans: endedBans,
      });
    }

    return { decremented, ended };
  },
});

export const undoEventPassed = mutation({
  args: {},
  handler: async (ctx): Promise<{ incremented: number; reactivated: number }> => {
    await requireEventBanWriteAccess(ctx);

    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

    // Increment remaining events for all active bans
    const activeBans = await ctx.db
      .query("eventBans")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();

    let incremented = 0;
    for (const ban of activeBans) {
      await ctx.db.patch(ban._id, {
        remainingEvents: ban.remainingEvents + 1,
        lastUpdated: todayStr,
      });
      incremented++;
    }

    // Reactivate bans that were ended today (likely ended by the last eventPassed)
    const endedBans = await ctx.db
      .query("eventBans")
      .withIndex("by_status", (q) => q.eq("status", "ENDED"))
      .collect();

    let reactivated = 0;
    const reactivatedBans: Array<{ discordId: string; messageId: string; startDate: string; remainingEvents: number }> = [];

    for (const ban of endedBans) {
      if (ban.lastUpdated === todayStr && ban.remainingEvents === 0) {
        await ctx.db.patch(ban._id, {
          remainingEvents: 1,
          status: "ACTIVE",
          lastUpdated: todayStr,
          // Reset Discord sync flags so the bot re-adds the role
          syncedToDiscord: false,
          roleRemovedFromDiscord: false,
        });
        reactivatedBans.push({
          discordId: ban.discordId,
          messageId: ban.messageId,
          startDate: ban.startDate,
          remainingEvents: 1,
        });
        reactivated++;
      }
    }

    // Schedule sheet update for reactivated bans
    if (reactivatedBans.length > 0) {
      await ctx.scheduler.runAfter(0, internal.eventBans.sync.updateSheetBansToActive, {
        bans: reactivatedBans,
      });
    }

    return { incremented, reactivated };
  },
});

/** One-time deploy helper: legacy rows with undefined sync flags are invisible to indexed pending queries. */
export const backfillEventBanDiscordSyncFlags = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const bans = await ctx.db.query("eventBans").collect();
    let patched = 0;

    for (const ban of bans) {
      const patch: {
        syncedToDiscord?: boolean;
        roleRemovedFromDiscord?: boolean;
      } = {};

      if (ban.syncedToDiscord === undefined) {
        patch.syncedToDiscord = false;
      }
      if (ban.roleRemovedFromDiscord === undefined) {
        patch.roleRemovedFromDiscord = false;
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(ban._id, patch);
        patched += 1;
      }
    }

    return { patched, total: bans.length };
  },
});