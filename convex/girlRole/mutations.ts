import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

const verificationValidator = v.object({
  discordUserId: v.optional(v.string()),
  discordUsername: v.optional(v.string()),
  verificationMethod: v.optional(v.string()),
});

/** Replace all Girl Role verifications from a full sheet sync. */
export const replaceAllVerifications = internalMutation({
  args: {
    verifications: v.array(verificationValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("girlRoleVerifications").collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    let inserted = 0;
    for (const entry of args.verifications) {
      const discordUserId = entry.discordUserId?.trim() || undefined;
      const discordUsername = entry.discordUsername?.trim().toLowerCase() || undefined;
      const verificationMethod = entry.verificationMethod?.trim() || undefined;

      if (!discordUserId && !discordUsername) continue;

      await ctx.db.insert("girlRoleVerifications", {
        discordUserId,
        discordUsername,
        verificationMethod,
        syncedAt: Date.now(),
      });
      inserted++;
    }

    return { inserted, cleared: existing.length };
  },
});
