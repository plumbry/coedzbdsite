import { mutation } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

// Helper mutation to sync player scores and clean up old score records
export const syncScores = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Delete old incomplete score records
    const allScores = await ctx.db.query("manualScores").collect();
    const validScores = [];
    const invalidScores = [];
    
    for (const score of allScores) {
      // Check if it has the new fields
      if (score.thirdPartyExperience !== undefined) {
        validScores.push(score);
        // Update player with total score and tier
        await ctx.db.patch(score.playerId, {
          totalScore: score.totalScore,
          tier: score.tier,
        });
      } else {
        // Delete old format scores
        invalidScores.push(score._id);
        await ctx.db.delete(score._id);
      }
    }
    
    return { 
      synced: validScores.length,
      deleted: invalidScores.length
    };
  },
});

// Migration to convert social link URLs to usernames
export const migrateSocialLinksToUsernames = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const players = await ctx.db.query("players").collect();
    let migratedCount = 0;
    
    for (const player of players) {
      const updates: Record<string, string | undefined> = {};
      let needsUpdate = false;
      
      if (player.twitterUrl) {
        const url = player.twitterUrl;
        // Extract username from URL
        const username = url.includes('twitter.com/') || url.includes('x.com/') 
          ? url.split('/').pop()?.replace('@', '') 
          : url.replace('@', '');
        updates.twitterUsername = username;
        needsUpdate = true;
      }
      
      if (player.twitchUrl) {
        const url = player.twitchUrl;
        // Extract username from URL
        const username = url.includes('twitch.tv/') 
          ? url.split('/').pop() 
          : url;
        updates.twitchUsername = username;
        needsUpdate = true;
      }
      
      if (player.youtubeUrl) {
        const url = player.youtubeUrl;
        // Extract username from URL
        const username = url.includes('youtube.com/') 
          ? url.split('/').pop() 
          : url;
        updates.youtubeUsername = username;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await ctx.db.patch(player._id, updates);
        migratedCount++;
      }
    }
    
    return { 
      migratedCount,
      totalPlayers: players.length
    };
  },
});

// Cleanup mutation to remove deprecated URL fields
export const cleanupDeprecatedUrlFields = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const players = await ctx.db.query("players").collect();
    let cleanedCount = 0;
    
    for (const player of players) {
      let needsCleanup = false;
      
      if (player.twitterUrl || player.twitchUrl || player.youtubeUrl) {
        needsCleanup = true;
      }
      
      if (needsCleanup) {
        // Create cleaned player object with only valid fields
        const cleanedPlayer = {
          discordUsername: player.discordUsername,
          discordUserId: player.discordUserId,
          serverJoinDate: player.serverJoinDate,
          epicUsername: player.epicUsername,
          ...(player.nickname && { nickname: player.nickname }),
          ...(player.twitterUsername && { twitterUsername: player.twitterUsername }),
          ...(player.twitchUsername && { twitchUsername: player.twitchUsername }),
          ...(player.youtubeUsername && { youtubeUsername: player.youtubeUsername }),
          ...(player.totalScore !== undefined && { totalScore: player.totalScore }),
          ...(player.tier && { tier: player.tier }),
          ...(player.createdBy && { createdBy: player.createdBy }),
          ...(player.status && { status: player.status }),
          ...(player.adminComments && { adminComments: player.adminComments }),
          ...(player.rejectionReason && { rejectionReason: player.rejectionReason }),
        };
        
        await ctx.db.replace(player._id, cleanedPlayer);
        cleanedCount++;
      }
    }
    
    return { 
      cleanedCount,
      totalPlayers: players.length
    };
  },
});
