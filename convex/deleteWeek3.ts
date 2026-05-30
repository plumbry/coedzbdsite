import { mutation } from "./_generated/server";
import { ConvexError } from "convex/values";

// One-time mutation to delete all ZBD Season 5 Week 3 results from both tables
export const deleteAllWeek3Results = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
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
