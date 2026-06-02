import { query } from "../_generated/server";
import { requireModeratorOrAdmin } from "../auth_helpers";

export const assertStaffAccess = query({
  args: {},
  handler: async (ctx) => {
    await requireModeratorOrAdmin(ctx);
    return true;
  },
});

export const getVerificationCount = query({
  args: {},
  handler: async (ctx) => {
    await requireModeratorOrAdmin(ctx);
    const records = await ctx.db.query("girlRoleVerifications").collect();
    const latestSyncedAt = records.reduce(
      (max, r) => Math.max(max, r.syncedAt),
      0,
    );
    return {
      count: records.length,
      lastSyncedAt: latestSyncedAt || null,
    };
  },
});
