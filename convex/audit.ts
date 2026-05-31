import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

function formatLog(log: {
  _id: string;
  _creationTime: number;
  action: string;
  userId: string;
  userName?: string;
  entityType: string;
  entityId?: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
}) {
  return {
    ...log,
    createdAt: new Date(log._creationTime).toISOString(),
  };
}

// Get audit logs (admin only) — fixed limit, legacy
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

    return logs.map(formatLog);
  },
});

// Paginated audit logs (admin only)
export const getAuditLogsPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const page = await ctx.db.query("auditLogs").order("desc").paginate(args.paginationOpts);

    return {
      ...page,
      page: page.page.map(formatLog),
    };
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
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .order("desc")
      .take(50);

    return logs.map(formatLog);
  },
});
