import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireEventBanAccess } from "../auth_helpers";

export const getActiveBans = query({
  args: {},
  handler: async (ctx) => {
    const bans = await ctx.db
      .query("eventBans")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();
    // Sort by start date descending (most recent first)
    const sorted = bans.sort((a, b) => {
      const dateA = parseDate(a.startDate);
      const dateB = parseDate(b.startDate);
      return dateB.getTime() - dateA.getTime();
    });
    // Enrich with epic username from players table
    const enriched = await Promise.all(
      sorted.map(async (ban) => {
        const player = await ctx.db
          .query("players")
          .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", ban.discordId))
          .first();
        return { ...ban, epicUsername: player?.epicUsername ?? null };
      })
    );
    return enriched;
  },
});

export const getEndedBans = query({
  args: {},
  handler: async (ctx) => {
    const bans = await ctx.db
      .query("eventBans")
      .withIndex("by_status", (q) => q.eq("status", "ENDED"))
      .collect();
    // Sort by last updated descending (most recent first)
    const sorted = bans.sort((a, b) => {
      const dateA = parseDate(a.lastUpdated);
      const dateB = parseDate(b.lastUpdated);
      return dateB.getTime() - dateA.getTime();
    });
    // Enrich with epic username from players table
    const enriched = await Promise.all(
      sorted.map(async (ban) => {
        const player = await ctx.db
          .query("players")
          .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", ban.discordId))
          .first();
        return { ...ban, epicUsername: player?.epicUsername ?? null };
      })
    );
    return enriched;
  },
});

export const getEndedBansPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("eventBans")
      .withIndex("by_status", (q) => q.eq("status", "ENDED"))
      .order("desc")
      .paginate(args.paginationOpts);

    const enriched = await Promise.all(
      page.page.map(async (ban) => {
        const player = await ctx.db
          .query("players")
          .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", ban.discordId))
          .first();
        return { ...ban, epicUsername: player?.epicUsername ?? null };
      }),
    );

    return { ...page, page: enriched };
  },
});

export const getBansByDiscordId = query({
  args: { discordId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("eventBans")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .collect();
  },
});

export const getEventPassedMetadata = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("eventBansMetadata").first();
  },
});

export const getSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    const activeBans = await ctx.db
      .query("eventBans")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();
    const endedBans = await ctx.db
      .query("eventBans")
      .withIndex("by_status", (q) => q.eq("status", "ENDED"))
      .collect();
    return {
      totalBans: activeBans.length + endedBans.length,
      activeBans: activeBans.length,
      endedBans: endedBans.length,
    };
  },
});

export const getRoleSyncVisibility = query({
  args: {},
  handler: async (ctx) => {
    await requireEventBanAccess(ctx);

    const roleSyncBanTypes = new Set([
      "Minor Event Ban",
      "Major Event Ban",
      "Event Ban",
      "Probation",
    ]);

    const unsynced = await ctx.db
      .query("eventBans")
      .withIndex("by_synced_to_discord", (q) => q.eq("syncedToDiscord", false))
      .collect();
    const neverSynced = await ctx.db
      .query("eventBans")
      .filter((q) => q.eq(q.field("syncedToDiscord"), undefined))
      .collect();
    const pendingRoleAdds = [...unsynced, ...neverSynced].filter((ban) =>
      roleSyncBanTypes.has(ban.banType),
    );

    const syncedNotRemoved = await ctx.db
      .query("eventBans")
      .withIndex("by_synced_to_discord", (q) => q.eq("syncedToDiscord", true))
      .collect();
    const queuedRemovals = await ctx.db.query("pendingRoleRemovals").collect();
    const now = Date.now();
    const twentyEightDaysMs = 28 * 24 * 60 * 60 * 1000;

    const pendingRoleRemovals = syncedNotRemoved.filter((ban) => {
      if (ban.roleRemovedFromDiscord) return false;
      if (!roleSyncBanTypes.has(ban.banType)) return false;
      if (ban.banType !== "Probation" && ban.status === "ENDED") return true;

      if (ban.banType === "Probation") {
        const parts = ban.startDate.split("/");
        if (parts.length === 3) {
          const startTime = parseDate(ban.startDate).getTime();
          return now - startTime >= twentyEightDaysMs;
        }
      }

      return false;
    });

    return {
      pendingRoleAdds: pendingRoleAdds.length,
      pendingRoleRemovals: pendingRoleRemovals.length + queuedRemovals.length,
      queuedDeletedBanRoleRemovals: queuedRemovals.length,
      recentPendingAdds: pendingRoleAdds.slice(0, 5).map((ban) => ({
        _id: ban._id,
        playerTag: ban.playerTag,
        discordId: ban.discordId,
        banType: ban.banType,
        status: ban.status,
      })),
      recentPendingRemovals: [
        ...pendingRoleRemovals.slice(0, 5).map((ban) => ({
          _id: ban._id,
          playerTag: ban.playerTag,
          discordId: ban.discordId,
          banType: ban.banType,
          source: "eventBans" as const,
        })),
        ...queuedRemovals.slice(0, 5).map((entry) => ({
          _id: entry._id,
          playerTag: null,
          discordId: entry.discordId,
          banType: entry.banType,
          source: "pendingRoleRemovals" as const,
        })),
      ].slice(0, 5),
    };
  },
});

// Get offense counts per player (how many minor/major offenses each player has)
export const getOffenseCounts = query({
  args: {},
  handler: async (ctx) => {
    const allBans = await ctx.db.query("eventBans").collect();

    // Group by discordId and count offenses per track
    const counts: Record<string, {
      discordId: string;
      playerTag: string;
      minorCount: number;
      majorCount: number;
      highestMinor: number;
      highestMajor: number;
    }> = {};

    for (const ban of allBans) {
      if (!ban.offenseTrack) continue;

      if (!counts[ban.discordId]) {
        counts[ban.discordId] = {
          discordId: ban.discordId,
          playerTag: ban.playerTag,
          minorCount: 0,
          majorCount: 0,
          highestMinor: 0,
          highestMajor: 0,
        };
      }

      const entry = counts[ban.discordId];
      // Update playerTag to latest
      entry.playerTag = ban.playerTag;

      if (ban.offenseTrack === "minor") {
        entry.minorCount++;
        if (ban.offenseNumber && ban.offenseNumber > entry.highestMinor) {
          entry.highestMinor = ban.offenseNumber;
        }
      } else if (ban.offenseTrack === "major") {
        entry.majorCount++;
        if (ban.offenseNumber && ban.offenseNumber > entry.highestMajor) {
          entry.highestMajor = ban.offenseNumber;
        }
      }
    }

    // Enrich with epic username from players table
    const entries = Object.values(counts);
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const player = await ctx.db
          .query("players")
          .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", entry.discordId))
          .first();
        return { ...entry, epicUsername: player?.epicUsername ?? null };
      })
    );

    return enriched;
  },
});

// Search players by name for the Create Ban dialog
export const searchPlayersForBan = query({
  args: { search: v.string() },
  handler: async (ctx, args) => {
    if (!args.search || args.search.length < 2) return [];
    const searchLower = args.search.toLowerCase();

    const players = await ctx.db
      .query("players")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    return players
      .filter((p) => {
        const dn = p.discordUsername?.toLowerCase() || "";
        const en = p.epicUsername?.toLowerCase() || "";
        const nick = p.nickname?.toLowerCase() || "";
        return dn.includes(searchLower) || en.includes(searchLower) || nick.includes(searchLower);
      })
      .slice(0, 10)
      .map((p) => ({
        _id: p._id,
        discordUsername: p.discordUsername,
        epicUsername: p.epicUsername,
        discordUserId: p.discordUserId,
        nickname: p.nickname,
      }));
  },
});

// Get a player's offense history to auto-detect next offense number
export const getPlayerOffenseHistory = query({
  args: { discordId: v.string() },
  handler: async (ctx, args) => {
    if (!args.discordId) return { minorCount: 0, majorCount: 0 };

    const bans = await ctx.db
      .query("eventBans")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .collect();

    let highestMinor = 0;
    let highestMajor = 0;

    for (const ban of bans) {
      if (ban.offenseTrack === "minor") {
        const num = ban.offenseNumber ?? 0;
        if (num > highestMinor) highestMinor = num;
      } else if (ban.offenseTrack === "major") {
        const num = ban.offenseNumber ?? 0;
        if (num > highestMajor) highestMajor = num;
      }
    }

    // Count total per track as fallback
    const minorCount = bans.filter((b) => b.offenseTrack === "minor").length;
    const majorCount = bans.filter((b) => b.offenseTrack === "major").length;

    return {
      minorCount: Math.max(highestMinor, minorCount),
      majorCount: Math.max(highestMajor, majorCount),
    };
  },
});

// Parse DD/MM/YYYY date string to Date object
function parseDate(dateStr: string): Date {
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date(0);
}

// Internal query to get a ban by ID (used by delete action)
export const getBanById = internalQuery({
  args: { banId: v.id("eventBans") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.banId);
  },
});

// Get event bans/probations that haven't been synced to Discord yet
// Only returns bans that require role sync (event bans and probations, not warnings)
export const getPendingRoleSyncs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const roleSyncBanTypes = new Set([
      "Minor Event Ban",
      "Major Event Ban",
      "Event Ban",
      "Probation",
    ]);

    const unsynced = await ctx.db
      .query("eventBans")
      .withIndex("by_synced_to_discord", (q) => q.eq("syncedToDiscord", false))
      .collect();

    const neverSynced = await ctx.db
      .query("eventBans")
      .filter((q) => q.eq(q.field("syncedToDiscord"), undefined))
      .collect();

    const pending = [...unsynced, ...neverSynced].filter(
      (ban) => roleSyncBanTypes.has(ban.banType),
    );

    return pending.map((ban) => ({
      _id: ban._id,
      discordId: ban.discordId,
      banType: ban.banType,
    }));
  },
});

// Get bans where the role should now be removed:
// - Event bans with status "ENDED" (events have passed)
// - Probations older than 28 days
// - Deleted bans that had roles (from pendingRoleRemovals table)
// Only returns bans that were synced (role was added) but not yet removed
export const getPendingRoleRemovals = internalQuery({
  args: {},
  handler: async (ctx) => {
    const roleSyncBanTypes = new Set([
      "Minor Event Ban",
      "Major Event Ban",
      "Event Ban",
      "Probation",
    ]);

    const now = Date.now();
    const TWENTY_EIGHT_DAYS_MS = 28 * 24 * 60 * 60 * 1000;

    const syncedNotRemoved = await ctx.db
      .query("eventBans")
      .withIndex("by_synced_to_discord", (q) => q.eq("syncedToDiscord", true))
      .collect();

    const fromBans = syncedNotRemoved
      .filter((ban) => {
        if (ban.roleRemovedFromDiscord) return false;
        if (!roleSyncBanTypes.has(ban.banType)) return false;

        if (ban.banType !== "Probation" && ban.status === "ENDED") {
          return true;
        }

        if (ban.banType === "Probation") {
          const parts = ban.startDate.split("/");
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            const startTime = new Date(year, month, day).getTime();
            if (now - startTime >= TWENTY_EIGHT_DAYS_MS) {
              return true;
            }
          }
        }

        return false;
      })
      .map((ban) => ({
        _id: ban._id,
        discordId: ban.discordId,
        banType: ban.banType,
        source: "eventBans" as const,
      }));

    const queuedRemovals = await ctx.db.query("pendingRoleRemovals").collect();
    const fromQueue = queuedRemovals.map((entry) => ({
      _id: entry._id,
      discordId: entry.discordId,
      banType: entry.banType,
      source: "pendingRoleRemovals" as const,
    }));

    return [...fromBans, ...fromQueue];
  },
});
