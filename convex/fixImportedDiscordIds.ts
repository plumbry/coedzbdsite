import { mutation } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

// One-time migration to fix players with "imported" Discord ID
export const fixImportedDiscordId = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const players = await ctx.db.query("players").collect();
    
    // Find players with "imported" Discord ID
    const importedPlayers = players.filter(p => p.discordUserId === "imported");
    
    let fixed = 0;
    const timestamp = Date.now();
    
    for (const player of importedPlayers) {
      // Generate unique placeholder ID
      const randomString = Math.random().toString(36).substring(2, 11);
      const placeholderId = `placeholder_${timestamp}_${randomString}`;
      
      await ctx.db.patch(player._id, {
        discordUserId: placeholderId,
      });
      
      fixed++;
    }
    
    return {
      success: true,
      fixed,
      total: importedPlayers.length,
    };
  },
});
