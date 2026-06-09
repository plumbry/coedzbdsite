"use node";

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { requireAdminAction } from "../auth_helpers";

/** Process queued event-ban / probation Discord role adds and removals. */
type RoleSyncResult = {
  rolesAdded: number;
  rolesRemoved: number;
  errors: number;
  errorMessages: string[];
};

export const syncPendingRoleChanges = action({
  args: {},
  handler: async (ctx): Promise<RoleSyncResult> => {
    await requireAdminAction(ctx);
    return await ctx.runAction(api.eventBans.roleSync.forceRoleSync, {});
  },
});
