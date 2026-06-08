import { mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { getDisplayName, requireEventBanAccess } from "../auth_helpers";

const statusValidator = v.optional(
  v.union(
    v.literal("tentative"),
    v.literal("confirmed"),
    v.literal("cancelled"),
  ),
);

function assertValidDate(date: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ConvexError({
      message: `${field} must be YYYY-MM-DD`,
      code: "INVALID_ARGUMENT",
    });
  }
}

function assertDateRange(date: string, endDate: string | undefined) {
  assertValidDate(date, "date");
  if (endDate !== undefined) {
    assertValidDate(endDate, "endDate");
    if (endDate < date) {
      throw new ConvexError({
        message: "End date cannot be before start date",
        code: "INVALID_ARGUMENT",
      });
    }
  }
}

export const createEntry = mutation({
  args: {
    title: v.string(),
    date: v.string(),
    endDate: v.optional(v.string()),
    time: v.optional(v.string()),
    description: v.optional(v.string()),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireEventBanAccess(ctx);
    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({
        message: "Title is required",
        code: "INVALID_ARGUMENT",
      });
    }

    assertDateRange(args.date, args.endDate);

    const now = Date.now();
    return await ctx.db.insert("potentialEventCalendarEntries", {
      title,
      date: args.date,
      endDate: args.endDate,
      time: args.time?.trim() || undefined,
      description: args.description?.trim() || undefined,
      status: args.status ?? "tentative",
      createdAt: now,
      updatedAt: now,
      createdBy: getDisplayName(user),
    });
  },
});

export const updateEntry = mutation({
  args: {
    id: v.id("potentialEventCalendarEntries"),
    title: v.string(),
    date: v.string(),
    endDate: v.optional(v.string()),
    time: v.optional(v.string()),
    description: v.optional(v.string()),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    await requireEventBanAccess(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        message: "Entry not found",
        code: "NOT_FOUND",
      });
    }

    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({
        message: "Title is required",
        code: "INVALID_ARGUMENT",
      });
    }

    assertDateRange(args.date, args.endDate);

    await ctx.db.patch(args.id, {
      title,
      date: args.date,
      endDate: args.endDate,
      time: args.time?.trim() || undefined,
      description: args.description?.trim() || undefined,
      status: args.status ?? "tentative",
      updatedAt: Date.now(),
    });
  },
});

export const deleteEntry = mutation({
  args: { id: v.id("potentialEventCalendarEntries") },
  handler: async (ctx, args) => {
    await requireEventBanAccess(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        message: "Entry not found",
        code: "NOT_FOUND",
      });
    }
    await ctx.db.delete(args.id);
  },
});
