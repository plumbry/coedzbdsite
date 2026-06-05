import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";

// Remove all duplicate eventResults, keeping only the most recent one per player+event
export const cleanupAllDuplicates = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Get all event results
    const allResults = await ctx.db
      .query("eventResults")
      .collect();
    
    // Group by player + event name
    const grouped = new Map<string, Doc<"eventResults">[]>();
    for (const result of allResults) {
      const key = `${result.playerId}-${result.eventName}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(result);
    }
    
    // For each group, keep only the best result (by eliminations, then points, then newest)
    let deleted = 0;
    for (const [key, results] of grouped.entries()) {
      if (results.length > 1) {
        // Sort by: highest eliminations, then highest points, then newest creation time
        results.sort((a, b) => {
          // First compare eliminations
          if (b.eliminations !== a.eliminations) {
            return b.eliminations - a.eliminations;
          }
          // Then compare event score/points
          if (b.eventScore !== a.eventScore) {
            return b.eventScore - a.eventScore;
          }
          // Finally use creation time as tiebreaker
          return b._creationTime - a._creationTime;
        });
        
        // Keep the first (best), delete the rest
        for (let i = 1; i < results.length; i++) {
          await ctx.db.delete(results[i]._id);
          deleted++;
        }
      }
    }
    
    return { 
      deleted,
      duplicateGroups: Array.from(grouped.values())
        .filter(g => g.length > 1)
        .length
    };
  },
});
