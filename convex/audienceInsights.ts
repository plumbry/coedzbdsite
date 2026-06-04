import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isVisibleInMemberLists } from "./helpers/playerAlt";
import { fetchThirdPartyResultsForPlayer } from "./helpers/playerResults";
import { isYuniteImport } from "./lib/importSource";
import { requireAdmin } from "./auth_helpers";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

const AUDIENCE_INSIGHTS_CACHE_VERSION = 5;
const RECENT_EVENT_WINDOW_WEEKS = 4;
const RECENT_EVENT_PLAYED_THRESHOLD = 3;
const MEMBERS_PER_BATCH = 8;
const STALE_JOB_MS = 6 * 60 * 60 * 1000;
const STALE_PROGRESS_MS = 5 * 60 * 1000;
const RECONCILE_IDLE_MS = 90 * 1000;
const SEGMENT_LIST_PAGE_SIZE = 40;
const SEGMENT_DELETE_BATCH = 50;

const chartTypeValidator = v.union(
  v.literal("gender"),
  v.literal("tier"),
  v.literal("tenure"),
  v.literal("events"),
  v.literal("recentEvents"),
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
  totalActiveMembers: number;
  tierSActive: number;
  tierAActive: number;
  tierBActive: number;
  tierCActive: number;
  tierOtherActive: number;
  tenureUnder3m: number;
  tenure3to6m: number;
  tenure6to12m: number;
  tenure1to2y: number;
  tenure2yPlus: number;
  tenureUnknown: number;
  eventsOverFive: number;
  eventsFiveOrLess: number;
  recentEventsOverThree: number;
  recentEventsThreeOrLess: number;
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
  totalActiveMembers: 0,
  tierSActive: 0,
  tierAActive: 0,
  tierBActive: 0,
  tierCActive: 0,
  tierOtherActive: 0,
  tenureUnder3m: 0,
  tenure3to6m: 0,
  tenure6to12m: 0,
  tenure1to2y: 0,
  tenure2yPlus: 0,
  tenureUnknown: 0,
  eventsOverFive: 0,
  eventsFiveOrLess: 0,
  recentEventsOverThree: 0,
  recentEventsThreeOrLess: 0,
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

function parseParticipationDateMs(dateStr: string): number | null {
  const parsed = Date.parse(dateStr);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) {
      return null;
    }
    return new Date(year, month, day).getTime();
  }

  return null;
}

async function resolveYuniteLeaderboardTime(
  ctx: MutationCtx | QueryCtx,
  importData: Doc<"thirdPartyImports">,
  importDateCache: Map<Id<"thirdPartyImports">, number | null>,
): Promise<number | null> {
  const cached = importDateCache.get(importData._id);
  if (cached !== undefined) {
    return cached;
  }

  let dateStr: string | undefined = importData.eventDate;
  if (!dateStr && importData.eventId) {
    const event = await ctx.db.get(importData.eventId);
    if (event?.startDate) {
      dateStr = event.startDate;
    }
  }

  const timestamp = dateStr ? parseParticipationDateMs(dateStr) : null;
  importDateCache.set(importData._id, timestamp);
  return timestamp;
}

/** Each Yunite leaderboard import the player appears on counts as one event. */
async function countRecentYuniteLeaderboardsForPlayer(
  ctx: MutationCtx | QueryCtx,
  playerId: Id<"players">,
  importDateCache: Map<Id<"thirdPartyImports">, number | null>,
): Promise<number> {
  const windowStartMs =
    Date.now() - RECENT_EVENT_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000;
  const leaderboardImportIds = new Set<Id<"thirdPartyImports">>();

  const thirdPartyResults = await fetchThirdPartyResultsForPlayer(ctx, playerId);
  for (const result of thirdPartyResults) {
    const importData = await ctx.db.get(result.importId);
    if (!importData || !isYuniteImport(importData)) {
      continue;
    }

    const leaderboardAt = await resolveYuniteLeaderboardTime(
      ctx,
      importData,
      importDateCache,
    );
    if (leaderboardAt === null || leaderboardAt < windowStartMs) {
      continue;
    }
    leaderboardImportIds.add(result.importId);
  }

  return leaderboardImportIds.size;
}

function accumulateMember(
  counters: JobCounters,
  member: AcceptedMember,
  gender: number | undefined,
  recentEventsInWindow: number,
) {
  if (gender === 100) counters.male += 1;
  else if (gender === 50) counters.female += 1;
  else counters.genderUnknown += 1;

  if (member.tier === "S") counters.tierS += 1;
  else if (member.tier === "A") counters.tierA += 1;
  else if (member.tier === "B") counters.tierB += 1;
  else if (member.tier === "C") counters.tierC += 1;
  else counters.tierOther += 1;

  if (member.isRecentlyActive) {
    counters.totalActiveMembers += 1;
    if (member.tier === "S") counters.tierSActive += 1;
    else if (member.tier === "A") counters.tierAActive += 1;
    else if (member.tier === "B") counters.tierBActive += 1;
    else if (member.tier === "C") counters.tierCActive += 1;
    else counters.tierOtherActive += 1;
  }

  const eventsPlayed = member.eventsPlayedCount ?? 0;
  if (eventsPlayed > 5) counters.eventsOverFive += 1;
  else counters.eventsFiveOrLess += 1;

  if (recentEventsInWindow > RECENT_EVENT_PLAYED_THRESHOLD) {
    counters.recentEventsOverThree += 1;
  } else {
    counters.recentEventsThreeOrLess += 1;
  }

  const tenureKey = tenureBucketForMonths(
    monthsSinceServerJoin(member.serverJoinDate),
  );
  counters[tenureKey] += 1;
}

function tierSegmentsFromCounters(
  counters: Pick<
    JobCounters,
    "tierS" | "tierA" | "tierB" | "tierC" | "tierOther"
  >,
): ChartSegment[] {
  return [
    { label: "Tier S", value: counters.tierS, color: "#ef4444" },
    { label: "Tier A", value: counters.tierA, color: "#f59e0b" },
    { label: "Tier B", value: counters.tierB, color: "#3b82f6" },
    { label: "Tier C", value: counters.tierC, color: "#22c55e" },
    { label: "Unassigned", value: counters.tierOther, color: "#6b7280" },
  ].filter((s) => s.value > 0);
}

function segmentsFromCounters(counters: JobCounters, totalMembers: number) {
  const filterPositive = (segments: ChartSegment[]) =>
    segments.filter((s) => s.value > 0);

  return {
    totalMembers,
    totalActiveMembers: counters.totalActiveMembers,
    gender: filterPositive([
      { label: "Male", value: counters.male, color: "#4f46e5" },
      { label: "Female", value: counters.female, color: "#22c55e" },
      { label: "Unknown", value: counters.genderUnknown, color: "#ef4444" },
    ]),
    tier: tierSegmentsFromCounters(counters),
    tierActive: tierSegmentsFromCounters({
      tierS: counters.tierSActive,
      tierA: counters.tierAActive,
      tierB: counters.tierBActive,
      tierC: counters.tierCActive,
      tierOther: counters.tierOtherActive,
    }),
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
    recentEvents: [
      {
        label: "> 3 Leaderboards (last 4 weeks)",
        value: counters.recentEventsOverThree,
        color: "#4f46e5",
      },
      {
        label: "3 or fewer leaderboards (last 4 weeks)",
        value: counters.recentEventsThreeOrLess,
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
  if (chart === "recentEvents") {
    return segment === "over3" || segment === "threeOrLess";
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

function recentEventsSegmentForCount(recentEventsInWindow: number): string {
  return recentEventsInWindow > RECENT_EVENT_PLAYED_THRESHOLD
    ? "over3"
    : "threeOrLess";
}

async function insertSegmentMemberRows(
  ctx: MutationCtx,
  member: AcceptedMember,
  gender: number | undefined,
  recentEventsInWindow: number,
) {
  const base = {
    playerId: member._id,
    discordUsername: member.discordUsername,
    epicUsername: member.epicUsername,
    tier: member.tier,
    eventsPlayedCount: member.eventsPlayedCount ?? 0,
    genderLabel: genderLabel(gender),
    serverJoinDate: member.serverJoinDate,
    isRecentlyActive: member.isRecentlyActive ?? false,
  };

  const tenureBucket = tenureBucketForMonths(
    monthsSinceServerJoin(member.serverJoinDate),
  );

  const segmentRows = [
    { chart: "gender" as const, segment: genderSegmentForValue(gender) },
    { chart: "tier" as const, segment: tierSegmentForMember(member) },
    { chart: "tenure" as const, segment: tenureBucketToSegmentSlug(tenureBucket) },
    { chart: "events" as const, segment: eventsSegmentForMember(member) },
    {
      chart: "recentEvents" as const,
      segment: recentEventsSegmentForCount(recentEventsInWindow),
    },
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
    insightsCacheVersion: number;
    totalMembers: number;
    totalActiveMembers: number;
    gender: ChartSegment[];
    tier: ChartSegment[];
    tierActive: ChartSegment[];
    tenure: ChartSegment[];
    events: ChartSegment[];
    recentEvents: ChartSegment[];
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
    male: job.male ?? 0,
    female: job.female ?? 0,
    genderUnknown: job.genderUnknown ?? 0,
    tierS: job.tierS ?? 0,
    tierA: job.tierA ?? 0,
    tierB: job.tierB ?? 0,
    tierC: job.tierC ?? 0,
    tierOther: job.tierOther ?? 0,
    totalActiveMembers: job.totalActiveMembers ?? 0,
    tierSActive: job.tierSActive ?? 0,
    tierAActive: job.tierAActive ?? 0,
    tierBActive: job.tierBActive ?? 0,
    tierCActive: job.tierCActive ?? 0,
    tierOtherActive: job.tierOtherActive ?? 0,
    tenureUnder3m: job.tenureUnder3m ?? 0,
    tenure3to6m: job.tenure3to6m ?? 0,
    tenure6to12m: job.tenure6to12m ?? 0,
    tenure1to2y: job.tenure1to2y ?? 0,
    tenure2yPlus: job.tenure2yPlus ?? 0,
    tenureUnknown: job.tenureUnknown ?? 0,
    eventsOverFive: job.eventsOverFive ?? 0,
    eventsFiveOrLess: job.eventsFiveOrLess ?? 0,
    recentEventsOverThree: job.recentEventsOverThree ?? 0,
    recentEventsThreeOrLess: job.recentEventsThreeOrLess ?? 0,
  };
}

function snapshotHasActiveTierCache(
  cached: Doc<"audienceInsightsSnapshot">,
): boolean {
  return (
    cached.insightsCacheVersion === AUDIENCE_INSIGHTS_CACHE_VERSION ||
    typeof cached.totalActiveMembers === "number"
  );
}

async function computeActiveTierBreakdown(ctx: QueryCtx): Promise<{
  tierActive: ChartSegment[];
  totalActiveMembers: number;
}> {
  const counters = {
    tierS: 0,
    tierA: 0,
    tierB: 0,
    tierC: 0,
    tierOther: 0,
  };
  let totalActiveMembers = 0;

  const players = await ctx.db
    .query("players")
    .withIndex("by_membership_status", (q) =>
      q.eq("currentMembershipStatus", "accepted"),
    )
    .collect();

  for (const member of players) {
    if (!isVisibleInMemberLists(member)) continue;
    if (!member.isRecentlyActive) continue;
    totalActiveMembers += 1;
    if (member.tier === "S") counters.tierS += 1;
    else if (member.tier === "A") counters.tierA += 1;
    else if (member.tier === "B") counters.tierB += 1;
    else if (member.tier === "C") counters.tierC += 1;
    else counters.tierOther += 1;
  }

  return {
    tierActive: tierSegmentsFromCounters(counters),
    totalActiveMembers,
  };
}

function jobIdleMs(job: Doc<"audienceInsightsJobs">, now: number): number {
  return now - (job.lastProgressAt ?? job.startedAt);
}

async function failStaleRunningJobs(ctx: MutationCtx) {
  const running = await ctx.db
    .query("audienceInsightsJobs")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .collect();

  const now = Date.now();
  for (const job of running) {
    const idleMs = jobIdleMs(job, now);
    if (now - job.startedAt > STALE_JOB_MS || idleMs > STALE_PROGRESS_MS) {
      await ctx.db.patch(job._id, {
        status: "failed",
        errorMessage:
          idleMs > STALE_PROGRESS_MS
            ? "Rebuild stopped making progress — click Refresh stats to try again."
            : "Rebuild timed out — click Refresh stats again.",
        completedAt: now,
      });
    }
  }
}

/** Re-schedule a stalled chain before we mark the job failed. */
async function reconcileAudienceInsightsJobs(ctx: MutationCtx) {
  const running = await ctx.db
    .query("audienceInsightsJobs")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .collect();

  const now = Date.now();
  for (const job of running) {
    const idleMs = jobIdleMs(job, now);
    if (idleMs < RECONCILE_IDLE_MS || idleMs >= STALE_PROGRESS_MS) {
      continue;
    }

    await ctx.db.patch(job._id, { lastProgressAt: now });

    if (job.processedCount > 0 || job.playersCursor) {
      await ctx.scheduler.runAfter(
        0,
        internal.audienceInsights.processRebuildBatch,
        { jobId: job._id },
      );
    } else {
      await ctx.scheduler.runAfter(0, internal.audienceInsights.clearSegmentMembers, {
        jobId: job._id,
      });
    }
  }
}

const emptyInsights = {
  totalMembers: 0,
  totalActiveMembers: 0,
  gender: [] as ChartSegment[],
  tier: [] as ChartSegment[],
  tierActive: [] as ChartSegment[],
  tenure: [] as ChartSegment[],
  events: [] as ChartSegment[],
  recentEvents: [] as ChartSegment[],
  eventsReady: false,
  tierActiveReady: false,
  tierActiveSource: "cache" as const,
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

    const hasCachedActiveTier = snapshotHasActiveTierCache(cached);
    let tierActive = cached.tierActive ?? [];
    let totalActiveMembers = cached.totalActiveMembers ?? 0;
    let tierActiveSource: "cache" | "live" = "cache";

    if (!hasCachedActiveTier) {
      const live = await computeActiveTierBreakdown(ctx);
      tierActive = live.tierActive;
      totalActiveMembers = live.totalActiveMembers;
      tierActiveSource = "live";
    }

    return {
      totalMembers: cached.totalMembers,
      totalActiveMembers,
      gender: cached.gender ?? [],
      tier: cached.tier ?? [],
      tierActive,
      tenure: cached.tenure ?? [],
      events: cached.events ?? [],
      recentEvents: cached.recentEvents ?? [],
      eventsReady: cached.eventsReady,
      segmentMembersIndexed: cached.segmentMembersIndexed === true,
      lastUpdated: cached.lastUpdated,
      needsRebuild: false,
      tierActiveReady: true,
      tierActiveSource,
    };
  },
});

/** Paginated member list for a chart segment (reads pre-indexed rows). */
export const listAudienceInsightMembers = query({
  args: {
    chart: chartTypeValidator,
    segment: v.string(),
    playersCursor: v.optional(v.union(v.string(), v.null())),
    activeOnly: v.optional(v.boolean()),
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

    const activeOnly = args.chart === "tier" && args.activeOnly === true;

    const page = await ctx.db
      .query("audienceInsightsSegmentMembers")
      .withIndex("by_chart_segment", (q) =>
        q.eq("chart", args.chart).eq("segment", args.segment),
      )
      .paginate({
        numItems: SEGMENT_LIST_PAGE_SIZE,
        cursor: args.playersCursor ?? null,
      });

    const members = [];
    for (const row of page.page) {
      if (activeOnly) {
        if (row.isRecentlyActive === false) continue;
        if (row.isRecentlyActive !== true) {
          const player = await ctx.db.get(row.playerId);
          if (!player?.isRecentlyActive) continue;
        }
      }
      members.push({
        playerId: row.playerId,
        discordUsername: row.discordUsername,
        epicUsername: row.epicUsername,
        tier: row.tier,
        eventsPlayedCount: row.eventsPlayedCount,
        genderLabel: row.genderLabel,
        serverJoinDate: row.serverJoinDate,
      });
    }

    return {
      members,
      nextCursor: page.isDone ? null : page.continueCursor,
      hasMore: !page.isDone,
      needsRefresh: false,
    };
  },
});

export const clearSegmentMembers = internalMutation({
  args: {
    jobId: v.id("audienceInsightsJobs"),
    deleteCursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") {
      return;
    }

    const page = await ctx.db.query("audienceInsightsSegmentMembers").paginate({
      numItems: SEGMENT_DELETE_BATCH,
      cursor: args.deleteCursor ?? null,
    });

    for (const row of page.page) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.patch(args.jobId, { lastProgressAt: Date.now() });

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.audienceInsights.clearSegmentMembers, {
        jobId: args.jobId,
        deleteCursor: page.continueCursor,
      });
      return;
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

    const now = Date.now();
    const idleMs = jobIdleMs(job, now);

    return {
      status: job.status,
      processedCount: job.processedCount,
      totalCount: job.totalCount,
      startedAt: job.startedAt,
      lastProgressAt: job.lastProgressAt ?? job.startedAt,
      appearsStuck: idleMs >= RECONCILE_IDLE_MS,
    };
  },
});

/** Fails timed-out jobs and re-kicks stalled background chains (safe to call while viewing the page). */
export const cleanupAudienceInsightsRebuildJobs = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await reconcileAudienceInsightsJobs(ctx);
    await failStaleRunningJobs(ctx);
    return { ok: true };
  },
});

export const cancelAudienceInsightsRebuild = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const running = await ctx.db
      .query("audienceInsightsJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    const now = Date.now();
    for (const job of running) {
      await ctx.db.patch(job._id, {
        status: "failed",
        errorMessage: "Rebuild cancelled.",
        completedAt: now,
      });
    }

    return { cancelled: running.length };
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
      lastProgressAt: now,
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
    const importDateCache = new Map<Id<"thirdPartyImports">, number | null>();

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
        if (!isVisibleInMemberLists(member)) continue;
        const gender = await genderForPlayer(ctx, member._id);
        const recentEventsInWindow = await countRecentYuniteLeaderboardsForPlayer(
          ctx,
          member._id,
          importDateCache,
        );
        accumulateMember(counters, member, gender, recentEventsInWindow);
        await insertSegmentMemberRows(
          ctx,
          member,
          gender,
          recentEventsInWindow,
        );
      }

      const processedCount = job.processedCount + page.page.length;

      if (!page.isDone) {
        await ctx.db.patch(args.jobId, {
          processedCount,
          totalCount: Math.max(job.totalCount, processedCount),
          playersCursor: page.continueCursor,
          lastProgressAt: Date.now(),
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
        insightsCacheVersion: AUDIENCE_INSIGHTS_CACHE_VERSION,
        eventsReady: true,
        segmentMembersIndexed: true,
        lastUpdated: completedAt,
      });

      await ctx.db.patch(args.jobId, {
        status: "completed",
        totalCount: totalMembers,
        processedCount: totalMembers,
        playersCursor: null,
        lastProgressAt: completedAt,
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
