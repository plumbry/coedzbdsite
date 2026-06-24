import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireAdmin } from "../auth_helpers";
import type { DashboardFilter } from "./constants";
import { DASHBOARD_TIER_FILTERS } from "./constants";
import {
  enrichPlayerRow,
  getAcceptedApplicationTrackerLink,
  getReEvalByPlayerId,
  computeQueueCandidates,
  summarizeQueueCandidates,
  countActivePlayersForReEval,
  countEnrolledActivePlayers,
} from "./helpers";

const WORKFLOW_STATE_KEY = "summer_reeval";
const REVIEW_TIERS = ["S", "A", "B", "C"] as const;

async function getLatestQueueStatus(ctx: QueryCtx, playerId: Id<"players">) {
  const items = await ctx.db
    .query("tierRoleChangeQueue")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  if (items.length === 0) return null;
  items.sort((a, b) => b.requestedAt - a.requestedAt);
  return items[0].status;
}

function matchesFilter(
  filter: DashboardFilter,
  row: { currentTier?: string },
): boolean {
  if (filter === "all") return true;
  return row.currentTier === filter;
}

export const listDashboard = query({
  args: {
    filter: v.optional(v.string()),
    search: v.optional(v.string()),
    sortField: v.optional(v.string()),
    sortDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const filter = (args.filter ?? "all") as DashboardFilter;
    const search = (args.search ?? "").trim().toLowerCase();
    const sortField = args.sortField ?? "playerName";
    const sortDirection = args.sortDirection ?? "asc";

    const reEvalRows = await ctx.db.query("bigSummerReEval").collect();
    const enriched = [];

    for (const reEval of reEvalRows) {
      const player = await ctx.db.get(reEval.playerId);
      if (!player) continue;
      if (player.status !== "active" || player.currentMembershipStatus !== "accepted") {
        if (reEval.reEvalStatus !== "retired") continue;
      }

      const appLink = await getAcceptedApplicationTrackerLink(ctx, player._id);
      const trackerLink =
        reEval.fortniteTrackerLink ??
        appLink ??
        (player.epicUsername
          ? `https://fortnitetracker.com/profile/all/${encodeURIComponent(player.epicUsername)}`
          : undefined);
      const queueStatus = await getLatestQueueStatus(ctx, player._id);
      const row = enrichPlayerRow(reEval, player, trackerLink, queueStatus);

      if (!matchesFilter(filter, row)) continue;
      if (search) {
        const haystack = [
          row.playerName,
          row.discordUsername,
          row.discordId,
          row.epicUsername,
          row.epicId,
          row.currentTier,
          row.assignedAdminName,
          row.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) continue;
      }
      enriched.push(row);
    }

    enriched.sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      const av = (a as Record<string, unknown>)[sortField];
      const bv = (b as Record<string, unknown>)[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });

    return enriched;
  },
});

export const getWorkflowState = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const state = await ctx.db
      .query("bigSummerReEvalState")
      .withIndex("by_key", (q) => q.eq("key", WORKFLOW_STATE_KEY))
      .first();
    return state ?? {
      key: WORKFLOW_STATE_KEY,
      stage: "first_stage" as const,
      lastUpdatedAt: 0,
    };
  },
});

export const listFinalReview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const reEvalRows = await ctx.db.query("bigSummerReEval").collect();
    const changedPlayers = [];
    const privateTrackers = [];

    for (const reEval of reEvalRows) {
      const player = await ctx.db.get(reEval.playerId);
      if (!player) continue;
      const appLink = await getAcceptedApplicationTrackerLink(ctx, player._id);
      const trackerLink =
        reEval.fortniteTrackerLink ??
        appLink ??
        (player.epicUsername
          ? `https://fortnitetracker.com/profile/all/${encodeURIComponent(player.epicUsername)}`
          : undefined);
      const row = enrichPlayerRow(reEval, player, trackerLink, null);

      if (reEval.reEvalStatus === "private_tracker" || reEval.trackerStatus === "private") {
        privateTrackers.push(row);
        continue;
      }

      if (
        reEval.finalDecision &&
        REVIEW_TIERS.includes(reEval.finalDecision as (typeof REVIEW_TIERS)[number]) &&
        reEval.finalDecision !== player.tier
      ) {
        changedPlayers.push(row);
      }
    }

    changedPlayers.sort((a, b) => a.playerName.localeCompare(b.playerName));
    privateTrackers.sort((a, b) => a.playerName.localeCompare(b.playerName));

    return {
      changedPlayers,
      privateTrackers,
    };
  },
});

export const getFilterCounts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const counts: Record<DashboardFilter, number> = {
      all: 0,
      S: 0,
      A: 0,
      B: 0,
      C: 0,
    };

    const reEvalRows = await ctx.db.query("bigSummerReEval").collect();

    for (const reEval of reEvalRows) {
      const player = await ctx.db.get(reEval.playerId);
      if (!player) continue;
      if (player.status !== "active" || player.currentMembershipStatus !== "accepted") {
        if (reEval.reEvalStatus !== "retired") continue;
      }

      counts.all += 1;
      const tier = player.tier as DashboardFilter | undefined;
      if (tier && DASHBOARD_TIER_FILTERS.includes(tier)) {
        counts[tier] += 1;
      }
    }

    return counts;
  },
});

export const getPlayerDetail = query({
  args: { reEvalId: v.id("bigSummerReEval") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const reEval = await ctx.db.get(args.reEvalId);
    if (!reEval) return null;
    const player = await ctx.db.get(reEval.playerId);
    if (!player) return null;
    const appLink = await getAcceptedApplicationTrackerLink(ctx, player._id);
    const trackerLink =
      reEval.fortniteTrackerLink ??
      appLink ??
      (player.epicUsername
        ? `https://fortnitetracker.com/profile/all/${encodeURIComponent(player.epicUsername)}`
        : undefined);
    const queueItems = await ctx.db
      .query("tierRoleChangeQueue")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();
    queueItems.sort((a, b) => b.requestedAt - a.requestedAt);
    const auditLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "big_summer_reeval").eq("entityId", reEval._id),
      )
      .collect();
    auditLogs.sort((a, b) => b._creationTime - a._creationTime);

    return {
      ...enrichPlayerRow(
        reEval,
        player,
        trackerLink,
        queueItems[0]?.status ?? null,
      ),
      queueItems,
      auditLogs: auditLogs.slice(0, 50),
      eventsPlayedCount: player.eventsPlayedCount,
      hasMatchData: player.hasMatchData,
    };
  },
});

export const getAdmins = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .filter((user) => user.role === "admin")
      .map((user) => ({
        _id: user._id,
        name: user.username || user.name || user.email || "Admin",
      }));
  },
});

export const getInitializationStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const activeCount = await countActivePlayersForReEval(ctx);
    const reEvalCount = await countEnrolledActivePlayers(ctx);
    return { activeCount, reEvalCount, needsInitialization: false };
  },
});

export const getByPlayerIdInternal = internalQuery({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    return getReEvalByPlayerId(ctx, args.playerId);
  },
});

export const getReEvalProgress = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const reEvalRows = await ctx.db.query("bigSummerReEval").collect();
    const candidates = await computeQueueCandidates(ctx);

    let enrolled = 0;
    let withDecision = 0;
    let noChange = 0;

    for (const reEval of reEvalRows) {
      const player = await ctx.db.get(reEval.playerId);
      if (!player) continue;
      if (player.status !== "active" || player.currentMembershipStatus !== "accepted") {
        continue;
      }
      enrolled += 1;
      if (!reEval.finalDecision) continue;
      withDecision += 1;
      if (
        reEval.finalDecision === "no_change" ||
        reEval.finalDecision === player.tier
      ) {
        noChange += 1;
      }
    }

    const activePlayers = await ctx.db
      .query("players")
      .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
      .collect();
    const activeCount = activePlayers.filter((p) => p.status === "active").length;

    return {
      activeCount,
      enrolled,
      withDecision,
      pendingReview: Math.max(0, enrolled - withDecision),
      noChange,
      needsDiscordUpdate: candidates.length,
    };
  },
});

export const previewQueueDiscordRoleChanges = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const candidates = await computeQueueCandidates(ctx);
    return summarizeQueueCandidates(candidates);
  },
});

const STUCK_PROCESSING_MS = 15 * 60 * 1000;

export const getQueueHealth = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const processing = await ctx.db
      .query("tierRoleChangeQueue")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();
    const pending = await ctx.db
      .query("tierRoleChangeQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const failed = await ctx.db
      .query("tierRoleChangeQueue")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();

    const stuckItems = processing.filter((item) => {
      const startedAt = item.processingStartedAt ?? item.requestedAt;
      return now - startedAt >= STUCK_PROCESSING_MS;
    });

    return {
      pending: pending.length,
      processing: processing.length,
      failed: failed.length,
      stuckProcessing: stuckItems.length,
      stuckItems: stuckItems.map((item) => ({
        id: item._id,
        playerName: item.playerName,
        discordId: item.discordId,
        action: item.action,
        processingStartedAt: item.processingStartedAt ?? item.requestedAt,
      })),
    };
  },
});
