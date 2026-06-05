import { mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel.d.ts";
import { requireAdmin } from "./auth_helpers";

// Helper mutation to clean up old manualScores records
export const deleteOldScores = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const scores = await ctx.db.query("manualScores").collect();
    
    let deleted = 0;
    for (const score of scores as Array<Partial<Doc<"manualScores">> & { _id: string }>) {
      // Delete records that don't have the new schema fields
      if (!score.ability) {
        await ctx.db.delete(score._id as Doc<"manualScores">["_id"]);
        deleted++;
      }
    }
    
    return { deleted };
  },
});
