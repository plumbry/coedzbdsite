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

const MEMBERS_PER_BATCH = 12;
const STALE_JOB_MS = 6 * 60 * 60 * 1000;
const SEGMENT_LIST_PAGE_SIZE = 40;
const SEGMENT_DELETE_BATCH = 50;

const chartTypeValidator = v.union(
  v.literal("gender"),
  v.literal("tier"),
  v.literal("tenure"),
  v.literal("events"),
);

type ChartSegment = {
  label: string;
  value: number;
  color: string;
};

type AcceptedMember = Doc<"players">;

type JobCounters = {
  male: number;
  female: number;
  genderUnknown: number;
  tierS: number;
  tierA: number;
  tierB: number;
  tierC: number;
  tierOther: number;
  tenureUnder3m: number;
  tenure3to6m: number;
  tenure6to12m: number;
  tenure1to2y: number;
  tenure2yPlus: number;
  tenureUnknown: number;
  eventsOverFive: number;
  eventsFiveOrLess: number;
};

const EMPTY_COUNTERS: JobCounters = {
  male: 0,
  female: 0,
  genderUnknown: 0,
  tierS: 0,
  tierA: 0,
  tierB: 0,
  tierC: 0,
  tierOther: 0,
  tenureUnder3m: 0,
  tenure3to6m: 0,
  tenure6to12m: 0,
  tenure1to2y: 0,
  tenure2yPlus: 0,
  tenureUnknown: 0,
  eventsOverFive: 0,
  eventsFiveOrLess: 0,
};

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

function tenureBucketForMonths(months: number | null): keyof Pick<
  JobCounters,
  | "tenureUnder3m"
  | "tenure3to6m"
  | "tenure6to12m"
  | "tenure1to2y"
  | "tenure2yPlus"
  | "tenureUnknown"
> {
  if (months === null) return "tenureUnknown";
  if (months < 3) return "tenureUnder3m";
  if (months < 6) return "tenure3to6m";
  if (months < 12) return "tenure6to12m";
  if (months < 24) return "tenure1to2y";
  return "tenure2yPlus";
}

function accumulateMember(
  counters: JobCounters,
  member: AcceptedMember,
  gender: number | undefined,
) {
  if (gender === 100) counters.male += 1;
  else if (gender === 50) counters.female += 1;
  else counters.genderUnknown += 1;

  if (member.tier === "S") counters.tierS += 1;
  else if (member.tier === "A") counters.tierA += 1;
  else if (member.tier === "B") counters.tierB += 1;
  else if (member.tier === "C") counters.tierC += 1;
  else counters.tierOther += 1;

  const eventsPlayed = member.eventsPlayedCount ?? 0;
  if (eventsPlayed > 5) counters.eventsOverFive += 1;
  else counters.eventsFiveOrLess += 1;

  const tenureKey = tenureBucketForMonths(
    monthsSinceServerJoin(member.serverJoinDate),
  );
  counters[tenureKey] += 1;
}

function segmentsFromCounters(counters: JobCounters, totalMembers: number) {
  const filterPositive = (segments: ChartSegment[]) =>
    segments.filter((s) => s.value > 0);

  return {
    totalMembers,
    gender: filterPositive([
      { label: "Male", value: counters.male, color: "#4f46e5" },
      { label: "Female", value: counters.female, color: "#22c55e" },
      { label: "Unknown", value: counters.genderUnknown, color: "#ef4444" },
    ]),
    tier: filterPositive([
      { label: "Tier S", value: counters.tierS, color: "#ef4444" },
      { label: "Tier A", value: counters.tierA, color: "#f59e0b" },
      { label: "Tier B", value: counters.tierB, color: "#3b82f6" },
      { label: "Tier C", value: counters.tierC, color: "#22c55e" },
      { label: "Unassigned", value: counters.tierOther, color: "#6b7280" },
    ]),
    tenure: filterPositive([
      { label: "Under 3 months", value: counters.tenureUnder3m, color: "#4f46e5" },
      { label: "3–6 months", value: counters.tenure3to6m, color: "#22c55e" },
      { label: "6–12 months", value: counters.tenure6to12m, color: "#f59e0b" },
      { label: "1–2 years", value: counters.tenure1to2y, color: "#ef4444" },
      { label: "2+ years", value: counters.tenure2yPlus, color: "#8b5cf6" },
      { label: "Unknown", value: counters.tenureUnknown, color: "#6b7280" },
    ]),
    events: [
      { label: "> 5 Events", value: counters.eventsOverFive, color: "#4f46e5" },
      {
        label: "5 or fewer events",
        value: counters.eventsFiveOrLess,
        color: "#16a34a",
      },
    ],
  };
}

async function genderForPlayer(
  ctx: MutationCtx | QueryCtx,
  playerId: Id<"players">,
): Promise<number | undefined> {
  const score = await ctx.db
    .query("manualScores")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .first();
  return score?.gender;
}

function tenureBucketToSegmentSlug(
  bucket: keyof Pick<
    JobCounters,
    | "tenureUnder3m"
    | "tenure3to6m"
    | "tenure6to12m"
    | "tenure1to2y"
    | "tenure2yPlus"
    | "tenureUnknown"
  >,
): string {
  const map: Record<typeof bucket, string> = {
    tenureUnder3m: "under3m",
    tenure3to6m: "3to6m",
    tenure6to12m: "6to12m",
    tenure1to2y: "1to2y",
    tenure2yPlus: "2yplus",
    tenureUnknown: "unknown",
  };
  return map[bucket];
}

function genderLabel(gender: number | undefined): string {
  if (gender === 100) return "Male";
  if (gender === 50) return "Female";
  return "Unknown";
}

function isValidSegment(chart: string, segment: string): boolean {
  if (chart === "gender") {
    return segment === "male" || segment === "female" || segment === "unknown";
  }
  if (chart === "tier") {
    return ["s", "a", "b", "c", "unassigned"].includes(segment);
  }
  if (chart === "tenure") {
    return ["under3m", "3to6m", "6to12m", "1to2y", "2yplus", "unknown"].includes(
      segment,
    );
  }
  if (chart === "events") {
    return segment === "over5" || segment === "fiveOrLess";
  }
  return false;
}

function genderSegmentForValue(gender: number | undefined): string {
  if (gender === 100) return "male";
  if (gender === 50) return "female";
  return "unknown";
}

function tierSegmentForMember(member: AcceptedMember): string {
  if (member.tier === "S") return "s";
  if (member.tier === "A") return "a";
  if (member.tier === "B") return "b";
  if (member.tier === "C") return "c";
  return "unassigned";
}

function eventsSegmentForMember(member: AcceptedMember): string {
  return (member.eventsPlayedCount ?? 0) > 5 ? "over5" : "fiveOrLess";
}

async function insertSegmentMemberRows(
  ctx: MutationCtx,
  member: AcceptedMember,
  gender: number | undefined,
) {
  const base = {
    playerId: member._id,
    discordUsername: member.discordUsername,
    epicUsername: member.epicUsername,
    tier: member.tier,
    eventsPlayedCount: member.eventsPlayedCount ?? 0,
    genderLabel: genderLabel(gender),
    serverJoinDate: member.serverJoinDate,
  };

  const tenureBucket = tenureBucketForMonths(
    monthsSinceServerJoin(member.serverJoinDate),
  );

  const segmentRows = [
    { chart: "gender" as const, segment: genderSegmentForValue(gender) },
    { chart: "tier" as const, segment: tierSegmentForMember(member) },
    { chart: "tenure" as const, segment: tenureBucketToSegmentSlug(tenureBucket) },
    { chart: "events" as const, segment: eventsSegmentForMember(member) },
  ];

  for (const row of segmentRows) {
    await ctx.db.insert("audienceInsightsSegmentMembers", {
      ...base,
      ...row,
    });
  }
}

async function upsertAudienceInsightsSnapshot(
  ctx: MutationCtx,
  payload: {
    totalMembers: number;
    gender: ChartSegment[];
    tier: ChartSegment[];
    tenure: ChartSegment[];
    events: ChartSegment[];
    eventsReady: boolean;
    segmentMembersIndexed: boolean;
    lastUpdated: number;
  },
) {
  const existing = await ctx.db.query("audienceInsightsSnapshot").first();
  if (existing) {
    await ctx.db.replace(existing._id, payload);
  } else {
    await ctx.db.insert("audienceInsightsSnapshot", payload);
  }
}

function countersFromJob(job: Doc<"audienceInsightsJobs">): JobCounters {
  return {
    male: job.male,
    female: job.female,
    genderUnknown: job.genderUnknown,
    tierS: job.tierS,
    tierA: job.tierA,
    tierB: job.tierB,
    tierC: job.tierC,
    tierOther: job.tierOther,
    tenureUnder3m: job.tenureUnder3m,
    tenure3to6m: job.tenure3to6m,
    tenure6to12m: job.tenure6to12m,
    tenure1to2y: job.tenure1to2y,
    tenure2yPlus: job.tenure2yPlus,
    tenureUnknown: job.tenureUnknown,
    eventsOverFive: job.eventsOverFive,
    eventsFiveOrLess: job.eventsFiveOrLess,
  };
}

async function failStaleRunningJobs(ctx: MutationCtx) {
  const running = await ctx.db
    .query("audienceInsightsJobs")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .collect();

  const now = Date.now();
  for (const job of running) {
    if (now - job.startedAt > STALE_JOB_MS) {
      await ctx.db.patch(job._id, {
        status: "failed",
        errorMessage: "Rebuild timed out — click Refresh stats again.",
        completedAt: now,
      });
    }
  }
}

const emptyInsights = {
  totalMembers: 0,
  gender: [] as ChartSegment[],
  tier: [] as ChartSegment[],
  tenure: [] as ChartSegment[],
  events: [] as ChartSegment[],
  eventsReady: false,
  lastUpdated: undefined as number | undefined,
  needsRebuild: true,
};

/** Read-only: returns cached snapshot only (never scans result tables). */
export const getAudienceInsights = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const cached = await ctx.db.query("audienceInsightsSnapshot").first();
    if (!cached) {
      return emptyInsights;
    }

    return {
      totalMembers: cached.totalMembers,
      gender: cached.gender,
      tier: cached.tier,
      tenure: cached.tenure,
      events: cached.events,
      eventsReady: cached.eventsReady,
      segmentMembersIndexed: cached.segmentMembersIndexed === true,
      lastUpdated: cached.lastUpdated,
      needsRebuild: false,
    };
  },
});

/** Paginated member list for a chart segment (reads pre-indexed rows). */
export const listAudienceInsightMembers = query({
  args: {
    chart: chartTypeValidator,
    segment: v.string(),
    playersCursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (!isValidSegment(args.chart, args.segment)) {
      throw new ConvexError({
        message: "Invalid audience insight segment",
        code: "INVALID_ARGUMENT",
      });
    }

    const cached = await ctx.db.query("audienceInsightsSnapshot").first();
    if (!cached?.segmentMembersIndexed) {
      return {
        members: [],
        nextCursor: null,
        hasMore: false,
        needsRefresh: true,
      };
    }

    const page = await ctx.db
      .query("audienceInsightsSegmentMembers")
      .withIndex("by_chart_segment", (q) =>
        q.eq("chart", args.chart).eq("segment", args.segment),
      )
      .paginate({
        numItems: SEGMENT_LIST_PAGE_SIZE,
        cursor: args.playersCursor ?? null,
      });

    return {
      members: page.page.map((row) => ({
        playerId: row.playerId,
        discordUsername: row.discordUsername,
        epicUsername: row.epicUsername,
        tier: row.tier,
        eventsPlayedCount: row.eventsPlayedCount,
        genderLabel: row.genderLabel,
        serverJoinDate: row.serverJoinDate,
      })),
      nextCursor: page.isDone ? null : page.continueCursor,
      hasMore: !page.isDone,
      needsRefresh: false,
    };
  },
});

export const clearSegmentMembers = internalMutation({
  args: {
    jobId: v.id("audienceInsightsJobs"),
  },
  handler: async (ctx, args) => {
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page = await ctx.db.query("audienceInsightsSegmentMembers").paginate({
        numItems: SEGMENT_DELETE_BATCH,
        cursor,
      });

      for (const row of page.page) {
        await ctx.db.delete(row._id);
      }

      isDone = page.isDone;
      cursor = page.continueCursor;
    }

    await ctx.scheduler.runAfter(
      0,
      internal.audienceInsights.processRebuildBatch,
      { jobId: args.jobId },
    );
  },
});

export const getRebuildJobStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const job = await ctx.db
      .query("audienceInsightsJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();

    if (!job) {
      return null;
    }

    return {
      status: job.status,
      processedCount: job.processedCount,
      totalCount: job.totalCount,
      startedAt: job.startedAt,
    };
  },
});

/** No-op kept for older clients; legacy tables are no longer read. */
export const cleanupAudienceInsightsRebuildJobs = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await failStaleRunningJobs(ctx);
    return { deletedJobs: 0, cacheRepaired: false };
  },
});

/** Starts a batched background rebuild; returns immediately. */
export const rebuildAudienceInsightsCache = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    await failStaleRunningJobs(ctx);

    const running = await ctx.db
      .query("audienceInsightsJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();

    if (running) {
      throw new ConvexError({
        message: "An audience insights rebuild is already running",
        code: "CONFLICT",
      });
    }

    const now = Date.now();
    const jobId = await ctx.db.insert("audienceInsightsJobs", {
      status: "running",
      totalCount: 0,
      processedCount: 0,
      playersCursor: null,
      ...EMPTY_COUNTERS,
      startedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.audienceInsights.clearSegmentMembers, {
      jobId,
    });

    return {
      jobId,
      started: true,
    };
  },
});

export const processRebuildBatch = internalMutation({
  args: {
    jobId: v.id("audienceInsightsJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") {
      return;
    }

    const counters = countersFromJob(job);

    try {
      const page = await ctx.db
        .query("players")
        .withIndex("by_membership_status", (q) =>
          q.eq("currentMembershipStatus", "accepted"),
        )
        .paginate({
          numItems: MEMBERS_PER_BATCH,
          cursor: job.playersCursor,
        });

      for (const member of page.page) {
        const gender = await genderForPlayer(ctx, member._id);
        accumulateMember(counters, member, gender);
        await insertSegmentMemberRows(ctx, member, gender);
      }

      const processedCount = job.processedCount + page.page.length;

      if (!page.isDone) {
        await ctx.db.patch(args.jobId, {
          processedCount,
          totalCount: Math.max(job.totalCount, processedCount),
          playersCursor: page.continueCursor,
          ...counters,
        });

        await ctx.scheduler.runAfter(
          0,
          internal.audienceInsights.processRebuildBatch,
          { jobId: args.jobId },
        );
        return;
      }

      const completedAt = Date.now();
      const totalMembers = processedCount;
      const segments = segmentsFromCounters(counters, totalMembers);

      await upsertAudienceInsightsSnapshot(ctx, {
        ...segments,
        eventsReady: true,
        segmentMembersIndexed: true,
        lastUpdated: completedAt,
      });

      await ctx.db.patch(args.jobId, {
        status: "completed",
        totalCount: totalMembers,
        processedCount: totalMembers,
        playersCursor: null,
        ...counters,
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
