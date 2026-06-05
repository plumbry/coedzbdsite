import { mutation } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

/**
 * One-time fix: Find players with "imported" Discord ID but have discordRoles
 * These were created by merge operations before we fixed isPlaceholderId
 * For now, just replace with a unique placeholder so they can be matched by bot sync
 */
export const fixImportedWithRoles = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const allPlayers = await ctx.db.query("players").collect();
    
    // Find players with "imported" as Discord ID AND discordRoles set
    const problematicPlayers = allPlayers.filter(p => 
      p.discordUserId === "imported" && 
      p.discordRoles && 
      p.discordRoles.length > 0
    );
    
    let fixed = 0;
    
    for (const player of problematicPlayers) {
      // Generate a unique placeholder ID so bot can match them
      const uniquePlaceholder = `placeholder_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      await ctx.db.patch(player._id, {
        discordUserId: uniquePlaceholder,
        needsReview: true, // Flag for review since this is unusual
      });
      
      fixed++;
    }
    
    return {
      success: true,
      fixed,
      total: problematicPlayers.length,
    };
  },
});
