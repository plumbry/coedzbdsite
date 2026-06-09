import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/** Rebuild Mod Log Gender Sheet after membership or evaluation changes. */
export async function scheduleGenderSheetRebuild(ctx: MutationCtx) {
  await ctx.scheduler.runAfter(0, internal.genderSheet.sync.rebuildGenderSheet, {});
}
