"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { requireAdminAction } from "../auth_helpers";

export const clearYuniteData = action({
  args: {},
  handler: async (ctx) => {
    await requireAdminAction(ctx);
    // Get all Yunite imports
    const yuniteImports = await ctx.runQuery(internal.yunite.clearHelpers.getYuniteImports);
    
    console.log(`Found ${yuniteImports.length} Yunite API imports to delete (CSV imports will not be affected)`);
    
    let totalDeleted = 0;
    
    // Delete in batches to avoid hitting read limits
    for (const importRecord of yuniteImports) {
      console.log(`Deleting import: ${importRecord.eventName}`);
      
      // Delete results for this import in batches
      let hasMore = true;
      let batchCount = 0;
      
      while (hasMore) {
        const deleted = await ctx.runMutation(internal.yunite.clearHelpers.deleteResultsBatch, {
          importId: importRecord._id,
          batchSize: 100,
        });
        
        batchCount++;
        if (deleted === 0) {
          hasMore = false;
        }
      }
      
      console.log(`Deleted results in ${batchCount} batches`);
      
      // Delete the import record itself
      await ctx.runMutation(internal.yunite.clearHelpers.deleteImport, {
        importId: importRecord._id,
      });
      
      totalDeleted++;
    }
    
    // Reset sync status
    await ctx.runMutation(internal.sync.updateSyncStatusInternal, {
      syncType: "yunite",
      status: "success",
      recordsAdded: 0,
      recordsUpdated: 0,
    });
    
    console.log(`✅ Cleared ${totalDeleted} Yunite API imports (CSV imports preserved)`);
    
    return { deleted: totalDeleted };
  },
});

export const cleanupOrphanedResults = action({
  args: {},
  handler: async (ctx) => {
    await requireAdminAction(ctx);

    console.log("🧹 Cleaning up orphaned results...");
    
    let totalDeleted = 0;
    let hasMore = true;
    let batchCount = 0;
    
    while (hasMore) {
      const deleted = await ctx.runMutation(internal.yunite.clearHelpers.cleanupOrphanedResults, {
        batchSize: 100,
      });
      
      totalDeleted += deleted;
      batchCount++;
      
      if (deleted === 0) {
        hasMore = false;
      }
      
      // Add small delay to avoid rate limits
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`✅ Cleaned up ${totalDeleted} orphaned results in ${batchCount} batches`);
    
    return { deleted: totalDeleted };
  },
});
