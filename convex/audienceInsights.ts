import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

const BATCH_SIZE = 8;
const MANUAL_SCORES_PAGE_SIZE = 200;

type ChartSegment = {
  label: string;
  value: number;
  color: string;
};

type AcceptedMember = Doc<"players">;

function monthsSinceServerJoin(serverJoinDate: string): number | null {
  const joined = new Date(serverJoinDate);
  if (Number.isNaN(joined.getTime())) {
    return null;
  }
  const now = new Date();
  const months =
    (now.getFullYear() - joined.getFullYear()) * 12 +
    (now.getMonth() - joined.getMonth());
  const dayAdjust = now.getDate() < joined.getDate() ? -1 : 0;
  return Math.max(0, months + dayAdjust);
}

function tenureBucketForMonths(months: number | null): string {
  if (months === null) return "unknown";
  if (months < 3) return "under3m";
  if (months < 6) return "3to6m";
  if (months < 12) return "6to12m";
  if (months < 24) return "1to2y";
  return "2yPlus";
}

async function countDistinctEventsForPlayer(
  ctx: MutationCtx,
  playerId: Id<"players">,
): Promise<number> {
  const [eventResults, thirdPartyResults] = await Promise.all([
    ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .collect(),
    ctx.db
      .query("thirdPartyResults")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .collect(),
  ]);

  return new Set([
    ...eventResults.map((r) => r.eventName),
    ...thirdPartyResults.map((r) => r.eventName),
  ]).size;
}

function buildAudienceInsights(
  members: AcceptedMember[],
  genderByPlayer: Map<Id<"players">, number | undefined>,
  eventsPlayedByPlayer: Map<Id<"players">, number>,
) {
  let male = 0;
  let female = 0;
  let genderUnknown = 0;
  let tierS = 0;
  let tierA = 0;
  let tierB = 0;
  let tierC = 0;
  let tierOther = 0;
  let eventsOverFive = 0;
  let eventsFiveOrLess = 0;
  const tenureCounts: Record<string, number> = {
    under3m: 0,
    "3to6m": 0,
    "6to12m": 0,
    "1to2y": 0,
    "2yPlus": 0,
    unknown: 0,
  };

  for (const member of members) {
    const gender = genderByPlayer.get(member._id);
    if (gender === 100) male += 1;
    else if (gender === 50) female += 1;
    else genderUnknown += 1;

    if (member.tier === "S") tierS += 1;
    else if (member.tier === "A") tierA += 1;
    else if (member.tier === "B") tierB += 1;
    else if (member.tier === "C") tierC += 1;
    else tierOther += 1;

    const eventsPlayed = eventsPlayedByPlayer.get(member._id) ?? 0;
    if (eventsPlayed > 5) eventsOverFive += 1;
    else eventsFiveOrLess += 1;

    const tenureKey = tenureBucketForMonths(
      monthsSinceServerJoin(member.serverJoinDate),
    );
    tenureCounts[tenureKey] += 1;
  }

  const filterPositive = (segments: ChartSegment[]) =>
    segments.filter((s) => s.value > 0);

  const tenureLabels: Record<string, { label: string; color: string }> = {
    under3m: { label: "Under 3 months", color: "#4f46e5" },
    "3to6m": { label: "3–6 months", color: "#22c55e" },
    "6to12m": { label: "6–12 months", color: "#f59e0b" },
    "1to2y": { label: "1–2 years", color: "#ef4444" },
    "2yPlus": { label: "2+ years", color: "#8b5cf6" },
    unknown: { label: "Unknown", color: "#6b7280" },
  };

  return {
    totalMembers: members.length,
    gender: filterPositive([
      { label: "Male", value: male, color: "#4f46e5" },
      { label: "Female", value: female, color: "#22c55e" },
      { label: "Unknown", value: genderUnknown, color: "#ef4444" },
    ]),
    tier: filterPositive([
      { label: "Tier S", value: tierS, color: "#ef4444" },
      { label: "Tier A", value: tierA, color: "#f59e0b" },
      { label: "Tier B", value: tierB, color: "#3b82f6" },
      { label: "Tier C", value: tierC, color: "#22c55e" },
      { label: "Unassigned", value: tierOther, color: "#6b7280" },
    ]),
    tenure: filterPositive(
      Object.entries(tenureLabels).map(([key, meta]) => ({
        label: meta.label,
        value: tenureCounts[key] ?? 0,
        color: meta.color,
      })),
    ),
    events: [
      { label: "> 5 Events", value: eventsOverFive, color: "#4f46e5" },
      { label: "5 or fewer events", value: eventsFiveOrLess, color: "#16a34a" },
    ],
  };
}

async function loadAcceptedMembersWithGender(ctx: QueryCtx | MutationCtx) {
  const members = await ctx.db
    .query("players")
    .withIndex("by_membership_status", (q) =>
      q.eq("currentMembershipStatus", "accepted"),
    )
    .collect();

  const memberIds = new Set(members.map((member) => member._id));
  const genderByPlayer = new Map<Id<"players">, number | undefined>();

  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const page = await ctx.db.query("manualScores").paginate({
      numItems: MANUAL_SCORES_PAGE_SIZE,
      cursor,
    });
    for (const score of page.page) {
      if (memberIds.has(score.playerId)) {
        genderByPlayer.set(score.playerId, score.gender);
      }
    }
    isDone = page.isDone;
    cursor = page.continueCursor;
  }

  return { members, genderByPlayer };
}

async function upsertAudienceInsightsCache(
  ctx: MutationCtx,
  payload: {
    totalMembers: number;
    gender: ChartSegment[];
    tier: ChartSegment[];
    tenure: ChartSegment[];
    events: ChartSegment[];
    eventsReady: boolean;
    lastUpdated: number;
  },
) {
  const existing = await ctx.db.query("audienceInsightsCache").first();
  if (existing) {
    await ctx.db.replace(existing._id, payload);
  } else {
    await ctx.db.insert("audienceInsightsCache", payload);
  }
}

/** Read-only: returns cached data only (never scans result tables). */
export const getAudienceInsights = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const cached = await ctx.db.query("audienceInsightsCache").first();
    if (cached) {
      const eventsReady = cached.eventsReady === true;
      return {
        totalMembers: cached.totalMembers,
        gender: cached.gender,
        tier: cached.tier,
        tenure: cached.tenure,
        events: cached.events,
        eventsReady,
        lastUpdated: cached.lastUpdated,
        needsRebuild: false,
      };
    }

    return {
      totalMembers: 0,
      gender: [] as ChartSegment[],
      tier: [] as ChartSegment[],
      tenure: [] as ChartSegment[],
      events: [] as ChartSegment[],
      eventsReady: false,
      lastUpdated: undefined,
      needsRebuild: true,
    };
  },
});

export const getRebuildJobStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const job = await ctx.db
      .query("audienceInsightsRebuildJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();

    if (!job) {
      return null;
    }

    return {
      status: job.status,
      processedCount: job.processedCount,
      totalCount: job.memberIds.length,
      eventsOverFive: job.eventsOverFive,
      eventsFiveOrLess: job.eventsFiveOrLess,
      startedAt: job.startedAt,
    };
  },
});

/** Starts a batched background rebuild; returns immediately. */
export const rebuildAudienceInsightsCache = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const running = await ctx.db
      .query("audienceInsightsRebuildJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();

    if (running) {
      throw new ConvexError({
        message: "An audience insights rebuild is already running",
        code: "CONFLICT",
      });
    }

    const { members, genderByPlayer } = await loadAcceptedMembersWithGender(ctx);
    const placeholderEvents = new Map<Id<"players">, number>();
    for (const member of members) {
      placeholderEvents.set(member._id, 0);
    }

    const baseInsights = buildAudienceInsights(
      members,
      genderByPlayer,
      placeholderEvents,
    );
    const now = Date.now();

    await upsertAudienceInsightsCache(ctx, {
      ...baseInsights,
      events: [
        { label: "> 5 Events", value: 0, color: "#4f46e5" },
        { label: "5 or fewer events", value: members.length, color: "#16a34a" },
      ],
      eventsReady: false,
      lastUpdated: now,
    });

    const jobId = await ctx.db.insert("audienceInsightsRebuildJobs", {
      status: "running",
      memberIds: members.map((m) => m._id),
      processedCount: 0,
      eventsOverFive: 0,
      eventsFiveOrLess: 0,
      startedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.audienceInsights.processRebuildBatch,
      { jobId, startIndex: 0 },
    );

    return {
      jobId,
      totalMembers: members.length,
      started: true,
    };
  },
});

export const processRebuildBatch = internalMutation({
  args: {
    jobId: v.id("audienceInsightsRebuildJobs"),
    startIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") {
      return;
    }

    const batchIds = job.memberIds.slice(
      args.startIndex,
      args.startIndex + BATCH_SIZE,
    );

    let eventsOverFive = job.eventsOverFive;
    let eventsFiveOrLess = job.eventsFiveOrLess;

    try {
      for (const playerId of batchIds) {
        const distinctEvents = await countDistinctEventsForPlayer(ctx, playerId);
        if (distinctEvents > 5) {
          eventsOverFive += 1;
        } else {
          eventsFiveOrLess += 1;
        }

        const player = await ctx.db.get(playerId);
        if (player && player.eventsPlayedCount !== distinctEvents) {
          await ctx.db.patch(playerId, { eventsPlayedCount: distinctEvents });
        }
      }

      const processedCount = args.startIndex + batchIds.length;
      const nextIndex = args.startIndex + BATCH_SIZE;

      if (nextIndex < job.memberIds.length) {
        await ctx.db.patch(args.jobId, {
          processedCount,
          eventsOverFive,
          eventsFiveOrLess,
        });

        await ctx.scheduler.runAfter(
          0,
          internal.audienceInsights.processRebuildBatch,
          { jobId: args.jobId, startIndex: nextIndex },
        );
        return;
      }

      const cached = await ctx.db.query("audienceInsightsCache").first();
      const completedAt = Date.now();

      if (cached) {
        await ctx.db.patch(cached._id, {
          events: [
            { label: "> 5 Events", value: eventsOverFive, color: "#4f46e5" },
            {
              label: "5 or fewer events",
              value: eventsFiveOrLess,
              color: "#16a34a",
            },
          ],
          eventsReady: true,
          lastUpdated: completedAt,
        });
      }

      await ctx.db.patch(args.jobId, {
        status: "completed",
        processedCount: job.memberIds.length,
        eventsOverFive,
        eventsFiveOrLess,
        completedAt,
      });
    } catch (error) {
      await ctx.db.patch(args.jobId, {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown rebuild error",
        completedAt: Date.now(),
      });
    }
  },
});
