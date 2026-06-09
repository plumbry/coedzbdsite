import { mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { getDisplayName, requireEventBanAccess } from "../auth_helpers";
import {
  addDaysYmd,
  createRecurrenceSeriesId,
  daySpanInclusive,
  expandRecurrenceDates,
  type RecurrenceInterval,
} from "./recurrence";

const statusValidator = v.optional(
  v.union(
    v.literal("tentative"),
    v.literal("confirmed"),
    v.literal("admin_note"),
    v.literal("cancelled"),
  ),
);

const recurrenceValidator = v.optional(
  v.object({
    interval: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    until: v.string(),
  }),
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

function assertRecurrence(
  date: string,
  recurrence: { interval: RecurrenceInterval; until: string } | undefined,
) {
  if (!recurrence) return;

  assertValidDate(recurrence.until, "recurrence until");
  if (recurrence.until < date) {
    throw new ConvexError({
      message: "Recurrence end date cannot be before the start date",
      code: "INVALID_ARGUMENT",
    });
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
    recurrence: recurrenceValidator,
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
    assertRecurrence(args.date, args.recurrence);

    const now = Date.now();
    const createdBy = getDisplayName(user);
    const base = {
      title,
      time: args.time?.trim() || undefined,
      description: args.description?.trim() || undefined,
      status: args.status ?? "tentative",
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    if (!args.recurrence) {
      const id = await ctx.db.insert("potentialEventCalendarEntries", {
        ...base,
        date: args.date,
        endDate: args.endDate,
      });
      return { id, createdCount: 1 };
    }

    const occurrenceDates = expandRecurrenceDates(
      args.date,
      args.recurrence.until,
      args.recurrence.interval,
    );

    if (occurrenceDates.length === 0) {
      throw new ConvexError({
        message: "Recurrence produced no event dates",
        code: "INVALID_ARGUMENT",
      });
    }

    const spanDays = args.endDate ? daySpanInclusive(args.date, args.endDate) : 0;
    const seriesId = createRecurrenceSeriesId();
    const ids = [];

    for (const occurrenceDate of occurrenceDates) {
      const id = await ctx.db.insert("potentialEventCalendarEntries", {
        ...base,
        date: occurrenceDate,
        endDate: spanDays > 0 ? addDaysYmd(occurrenceDate, spanDays) : undefined,
        recurrenceSeriesId: seriesId,
      });
      ids.push(id);
    }

    return { id: ids[0], seriesId, createdCount: ids.length };
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
