"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel.d.ts";

export const parseReplayFile = action({
  args: {
    replayId: v.id("replays"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    try {
      // Update status to parsing
      await ctx.runMutation(internal.replays.mutations.updateReplayStatus, {
        replayId: args.replayId,
        status: "parsing",
      });

      // Download the file from storage
      const replayBlob = await ctx.storage.get(args.storageId);
      if (!replayBlob) {
        throw new Error("Replay file not found in storage");
      }

      // Convert blob to buffer
      const arrayBuffer = await replayBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Parse the replay
      const parseReplayModule = await import("fortnite-replay-parser");
      const parseReplay = parseReplayModule.default;
      const parsedData = await parseReplay(buffer, {
        parseLevel: 10, // Maximum parse level for full details
        debug: false,
      });

      if (!parsedData) {
        throw new Error("Failed to parse replay file");
      }

      // Type the parsed data loosely to work with the library's actual structure
      const data = parsedData as {
        header?: unknown;
        eliminations?: unknown;
        kills?: unknown;
        stats?: unknown;
        [key: string]: unknown;
      };

      // Extract match metadata (if available in the parsed data)
      const matchMetadata = {
        matchId: undefined,
        gameMode: undefined,
        mapName: undefined,
        matchDuration: undefined,
        recordingStartTime: undefined,
        recordingEndTime: undefined,
      };

      // Extract player stats
      const playerStats: Array<{
        epicUsername: string;
        epicId?: string;
        teamId?: string;
        eliminations: number;
        deaths: number;
        damage?: number;
        assists?: number;
        revives?: number;
        accuracy?: number;
        materials?: number;
      }> = [];

      // Parse player data from kills/eliminations (the library structure may vary)
      const eliminations = (data.eliminations || data.kills) as Array<{
        eliminator?: string;
        eliminated?: string;
        [key: string]: unknown;
      }> | undefined;

      if (eliminations && Array.isArray(eliminations)) {
        const playerMap = new Map<string, {
          eliminations: number;
          deaths: number;
          damage: number;
          assists: number;
        }>();

        for (const elim of eliminations) {
          const killer = elim.eliminator;
          const victim = elim.eliminated;

          if (killer && typeof killer === "string") {
            const existing = playerMap.get(killer) || { eliminations: 0, deaths: 0, damage: 0, assists: 0 };
            existing.eliminations += 1;
            playerMap.set(killer, existing);
          }

          if (victim && typeof victim === "string") {
            const existing = playerMap.get(victim) || { eliminations: 0, deaths: 0, damage: 0, assists: 0 };
            existing.deaths += 1;
            playerMap.set(victim, existing);
          }
        }

        for (const [username, stats] of playerMap) {
          playerStats.push({
            epicUsername: username,
            eliminations: stats.eliminations,
            deaths: stats.deaths,
            damage: stats.damage > 0 ? stats.damage : undefined,
            assists: stats.assists > 0 ? stats.assists : undefined,
          });
        }
      }

      // Extract team stats (if available)
      const teamStats: Array<{
        teamId?: string;
        teamName?: string;
        placement?: number;
        totalEliminations: number;
        totalDamage?: number;
      }> = [];

      // Save parsed data to database
      await ctx.runMutation(internal.replays.mutations.saveParsedReplayData, {
        replayId: args.replayId,
        matchMetadata,
        playerStats,
        teamStats,
      });

      return { success: true, playerCount: playerStats.length, teamCount: teamStats.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown parsing error";
      
      // Update status to failed
      await ctx.runMutation(internal.replays.mutations.updateReplayStatus, {
        replayId: args.replayId,
        status: "failed",
        error: errorMessage,
      });

      return { success: false, error: errorMessage };
    }
  },
});
