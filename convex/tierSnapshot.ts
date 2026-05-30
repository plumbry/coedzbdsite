import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";

/**
 * Given an array of leaderboard IDs (e.g. "yunite-ABC-DEF" or URLs like "https://yunite.xyz/leaderboard/ABC-DEF"),
 * find all matched players on those leaderboards and return their tier as of the given date.
 */
export const getTierSnapshot = query({
  args: {
    leaderboardInputs: v.array(v.string()),
    snapshotDate: v.string(), // ISO date string e.g. "2025-06-15"
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const targetTimestamp = new Date(args.snapshotDate + "T23:59:59.999Z").getTime();

    // Normalize inputs: extract leaderboard IDs from URLs or use as-is
    const leaderboardIds: string[] = args.leaderboardInputs.map((input) => {
      const trimmed = input.trim();
      // Try to extract from URL format
      const urlMatch = trimmed.match(/\/leaderboard\/([^/\s?#]+)/);
      if (urlMatch) {
        return `yunite-${urlMatch[1]}`;
      }
      // Already in "yunite-XXX" format or raw ID
      if (trimmed.startsWith("yunite-")) {
        return trimmed;
      }
      // Assume raw tournament ID
      return `yunite-${trimmed}`;
    });

    // Find matching thirdPartyImports
    const imports = await Promise.all(
      leaderboardIds.map(async (lbId) => {
        return await ctx.db
          .query("thirdPartyImports")
          .withIndex("by_leaderboard_id", (q) => q.eq("leaderboardId", lbId))
          .first();
      })
    );

    const validImports = imports.filter((imp) => imp !== null);

    if (validImports.length === 0) {
      return { players: [], unmatchedLeaderboards: leaderboardIds, totalFound: 0 };
    }

    // Collect all matched player IDs from thirdPartyResults for these imports
    const playerIdSet = new Set<string>();
    const playerInfoMap = new Map<string, { epicUsername: string; discordUsername?: string }>();

    for (const imp of validImports) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect();

      for (const result of results) {
        if (result.playerId && !playerIdSet.has(result.playerId)) {
          playerIdSet.add(result.playerId);
          playerInfoMap.set(result.playerId, {
            epicUsername: result.epicUsername,
            discordUsername: result.discordUsername ?? undefined,
          });
        }
      }
    }

    // For each player, determine their tier on the snapshot date
    const snapshotResults = await Promise.all(
      Array.from(playerIdSet).map(async (playerIdStr) => {
        const playerId = playerIdStr as Id<"players">;
        const player = await ctx.db.get(playerId);
        if (!player) return null;

        // Get all tier history entries for this player
        const history = await ctx.db
          .query("tierHistory")
          .withIndex("by_player", (q) => q.eq("playerId", playerId))
          .order("desc")
          .collect();

        // Find the most recent tier change on or before the snapshot date
        let tierOnDate: string | null = null;
        for (const entry of history) {
          if (entry._creationTime <= targetTimestamp) {
            tierOnDate = entry.tier;
            break;
          }
        }

        // If no tier history before this date, the player wasn't tiered yet on that date
        // But check if the player was created before that date and has a current tier
        // (they might have gotten their first tier before we started tracking history)
        if (tierOnDate === null && player._creationTime <= targetTimestamp && player.tier) {
          // Check if ALL tier history is after the target date
          // If so, the player's initial tier assignment happened after the target date
          const earliestHistory = history.length > 0 ? history[history.length - 1] : null;
          if (!earliestHistory || earliestHistory._creationTime > targetTimestamp) {
            // No history before target date - player wasn't tiered yet OR initial assignment wasn't tracked
            // Use the earliest recorded tier as a best guess if player was created before target
            if (earliestHistory && player._creationTime <= targetTimestamp) {
              // Use the "previousTier" of the earliest change if available, otherwise skip
              tierOnDate = earliestHistory.previousTier ?? null;
            }
          }
        }

        const info = playerInfoMap.get(playerId);

        return {
          epicUsername: info?.epicUsername ?? player.epicUsername,
          discordUsername: info?.discordUsername ?? player.discordUsername,
          currentTier: player.tier ?? "Untiered",
          tierOnDate: tierOnDate ?? "Not tiered on this date",
          playerId: player._id,
        };
      })
    );

    const validResults = snapshotResults.filter((r) => r !== null);

    // Figure out which leaderboard IDs didn't match
    const matchedLeaderboardIds = validImports.map((imp) => imp.leaderboardId);
    const unmatchedLeaderboards = leaderboardIds.filter(
      (id) => !matchedLeaderboardIds.includes(id)
    );

    return {
      players: validResults.sort((a, b) => a.epicUsername.localeCompare(b.epicUsername)),
      unmatchedLeaderboards,
      totalFound: validResults.length,
    };
  },
});
