import { mutation } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

// One-time mutation to delete all ZBD Season 5 Week 3 results from both tables
export const deleteAllWeek3Results = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Delete from eventResults
    const eventResults = await ctx.db.query("eventResults").collect();
    const week3EventResults = eventResults.filter(r => r.eventName === "ZBD Season 5 Week 3");
    
    for (const result of week3EventResults) {
      await ctx.db.delete(result._id);
    }
    
    // Delete from thirdPartyResults
    const thirdPartyResults = await ctx.db.query("thirdPartyResults").collect();
    const week3ThirdPartyResults = thirdPartyResults.filter(r => r.eventName === "ZBD Season 5 Week 3");
    
    for (const result of week3ThirdPartyResults) {
      await ctx.db.delete(result._id);
    }
    
    return { 
      deletedFromEventResults: week3EventResults.length,
      deletedFromThirdPartyResults: week3ThirdPartyResults.length,
      total: week3EventResults.length + week3ThirdPartyResults.length
    };
  },
});
