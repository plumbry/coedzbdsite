import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

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

  const scores = await ctx.db.query("manualScores").collect();
  const genderByPlayer = new Map<Id<"players">, number | undefined>();
  for (const score of scores) {
    genderByPlayer.set(score.playerId, score.gender);
  }

  return { members, genderByPlayer };
}

/** Fast read from cache; gender/tier/tenure can render before event cache exists. */
export const getAudienceInsights = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const cached = await ctx.db.query("audienceInsightsCache").first();
    if (cached) {
      return {
        totalMembers: cached.totalMembers,
        gender: cached.gender,
        tier: cached.tier,
        tenure: cached.tenure,
        events: cached.events,
        lastUpdated: cached.lastUpdated,
        needsRebuild: false,
      };
    }

    const { members, genderByPlayer } = await loadAcceptedMembersWithGender(ctx);
    const eventsPlayedByPlayer = new Map<Id<"players">, number>();
    for (const member of members) {
      eventsPlayedByPlayer.set(member._id, member.eventsPlayedCount ?? 0);
    }

    const partial = buildAudienceInsights(members, genderByPlayer, eventsPlayedByPlayer);

    return {
      ...partial,
      lastUpdated: undefined,
      needsRebuild: true,
    };
  },
});

/** Rebuilds cache using per-player indexes (safe for mutations, not queries). */
export const rebuildAudienceInsightsCache = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const { members, genderByPlayer } = await loadAcceptedMembersWithGender(ctx);
    const eventsPlayedByPlayer = new Map<Id<"players">, number>();

    for (const member of members) {
      const distinctEvents = await countDistinctEventsForPlayer(ctx, member._id);
      eventsPlayedByPlayer.set(member._id, distinctEvents);

      if (member.eventsPlayedCount !== distinctEvents) {
        await ctx.db.patch(member._id, { eventsPlayedCount: distinctEvents });
      }
    }

    const insights = buildAudienceInsights(
      members,
      genderByPlayer,
      eventsPlayedByPlayer,
    );
    const lastUpdated = Date.now();

    const existing = await ctx.db.query("audienceInsightsCache").first();
    const payload = { ...insights, lastUpdated };

    if (existing) {
      await ctx.db.replace(existing._id, payload);
    } else {
      await ctx.db.insert("audienceInsightsCache", payload);
    }

    return {
      ...insights,
      lastUpdated,
      playersUpdated: members.length,
    };
  },
});
