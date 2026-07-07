import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireEventBanAccess } from "../auth_helpers";
import { requireCalendarReadAccess, viewerTokenArg } from "./viewerAuth";

function entryEndDate(entry: Doc<"potentialEventCalendarEntries">): string {
  return entry.endDate ?? entry.date;
}

function entryOverlapsRange(
  entry: Doc<"potentialEventCalendarEntries">,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  return entry.date <= rangeEnd && entryEndDate(entry) >= rangeStart;
}

export const countEntriesByTitle = query({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    await requireEventBanAccess(ctx);
    const title = args.title.trim();
    if (!title) return 0;

    const entries = await ctx.db
      .query("potentialEventCalendarEntries")
      .withIndex("by_title", (q) => q.eq("title", title))
      .collect();

    return entries.length;
  },
});

export const listEntries = query({
  args: {
    viewerToken: viewerTokenArg,
    rangeStart: v.string(),
    rangeEnd: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCalendarReadAccess(ctx, args.viewerToken);

    const entries = await ctx.db.query("potentialEventCalendarEntries").collect();
    return entries
      .filter((entry) => entryOverlapsRange(entry, args.rangeStart, args.rangeEnd))
      .sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.title.localeCompare(b.title);
      });
  },
});
