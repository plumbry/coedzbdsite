import { internalMutation } from "../_generated/server";

/** One-shot: retype legacy `minicup` calendar events to `scrim`. Run via CLI only. */
export const mergeMinicupIntoScrim = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    let migrated = 0;

    for (const event of events) {
      if (event.type !== "minicup") continue;
      await ctx.db.patch(event._id, { type: "scrim" });
      migrated++;
    }

    return { migrated };
  },
});
