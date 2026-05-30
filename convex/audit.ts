import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

// Get audit logs (admin only)
export const getAuditLogs = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const logs = await ctx.db
      .query("auditLogs")
      .order("desc")
      .take(args.limit || 50);
    
    return logs.map(log => ({
      ...log,
      createdAt: new Date(log._creationTime).toISOString(),
    }));
  },
});

// Get audit logs for a specific entity
export const getEntityAuditLogs = query({
  args: {
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) => 
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .order("desc")
      .collect();
    
    return logs.map(log => ({
      ...log,
      createdAt: new Date(log._creationTime).toISOString(),
    }));
  },
});
