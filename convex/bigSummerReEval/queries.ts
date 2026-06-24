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
  countActivePlayersForReEval,
  countEnrolledActivePlayers,
} from "./helpers";

const WORKFLOW_STATE_KEY = "summer_reeval";
const REVIEW_TIERS = ["S", "A", "B", "C"] as const;

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

    const cacheRows = await ctx.db
      .query("bigSummerReEvalDashboardCache")
      .withIndex("by_active_and_tier", (q) => q.eq("isActiveAccepted", true))
      .collect();
    const filtered = [];

    for (const row of cacheRows) {
      if (!matchesFilter(filter, row)) continue;
      if (search && !row.searchText.includes(search)) continue;
      filtered.push({
        _id: row.reEvalId,
        playerId: row.playerId,
        playerName: row.playerName,
        discordId: row.discordId,
        discordUsername: row.discordUsername,
        epicUsername: row.epicUsername,
        fortniteTrackerLink: row.fortniteTrackerLink,
        currentTier: row.currentTier,
        trackerStatus: row.trackerStatus,
        reEvalStatus: row.reEvalStatus,
        assignedAdminId: row.assignedAdminId,
        assignedAdminName: row.assignedAdminName,
        finalDecision: row.finalDecision,
        evaluationStatus: row.evaluationStatus,
        evaluationStatusRaw: row.evaluationStatusRaw,
        evaluationTargetTier: row.evaluationTargetTier,
        evaluatedAt: row.evaluatedAt,
        summerTotalScore: row.summerTotalScore,
        summerTier: row.summerTier,
        appliedAt: row.appliedAt,
        appliedTier: row.appliedTier,
        lastUpdatedAt: row.lastUpdatedAt,
        notes: row.notes,
      });
    }

    filtered.sort((a, b) => {
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

    return filtered;
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
    const cacheRows = await ctx.db
      .query("bigSummerReEvalDashboardCache")
      .withIndex("by_active_and_tier", (q) => q.eq("isActiveAccepted", true))
      .collect();
    const changedPlayers = [];
    const privateTrackers = [];

    for (const row of cacheRows) {
      const dashboardRow = {
        _id: row.reEvalId,
        playerId: row.playerId,
        playerName: row.playerName,
        discordId: row.discordId,
        discordUsername: row.discordUsername,
        epicUsername: row.epicUsername,
        fortniteTrackerLink: row.fortniteTrackerLink,
        currentTier: row.currentTier,
        trackerStatus: row.trackerStatus,
        reEvalStatus: row.reEvalStatus,
        assignedAdminId: row.assignedAdminId,
        assignedAdminName: row.assignedAdminName,
        finalDecision: row.finalDecision,
        evaluationStatus: row.evaluationStatus,
        evaluationStatusRaw: row.evaluationStatusRaw,
        evaluationTargetTier: row.evaluationTargetTier,
        evaluatedAt: row.evaluatedAt,
        summerTotalScore: row.summerTotalScore,
        summerTier: row.summerTier,
        appliedAt: row.appliedAt,
        appliedTier: row.appliedTier,
        lastUpdatedAt: row.lastUpdatedAt,
        notes: row.notes,
      };

      if (row.reEvalStatus === "private_tracker" || row.trackerStatus === "private") {
        privateTrackers.push(dashboardRow);
        continue;
      }

      if (
        row.finalDecision &&
        REVIEW_TIERS.includes(row.finalDecision as (typeof REVIEW_TIERS)[number]) &&
        row.finalDecision !== row.currentTier
      ) {
        changedPlayers.push(dashboardRow);
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

    const cacheRows = await ctx.db
      .query("bigSummerReEvalDashboardCache")
      .withIndex("by_active_and_tier", (q) => q.eq("isActiveAccepted", true))
      .collect();

    for (const row of cacheRows) {
      counts.all += 1;
      const tier = row.currentTier as DashboardFilter | undefined;
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

    const cacheRows = await ctx.db
      .query("bigSummerReEvalDashboardCache")
      .withIndex("by_active_and_tier", (q) => q.eq("isActiveAccepted", true))
      .collect();

    let enrolled = 0;
    let withDecision = 0;
    let noChange = 0;
    let tierChanged = 0;

    for (const row of cacheRows) {
      enrolled += 1;
      if (!row.finalDecision) continue;
      withDecision += 1;
      if (
        row.finalDecision === "no_change" ||
        row.finalDecision === row.currentTier
      ) {
        noChange += 1;
      } else if (
        REVIEW_TIERS.includes(row.finalDecision as (typeof REVIEW_TIERS)[number]) &&
        row.finalDecision !== row.currentTier
      ) {
        tierChanged += 1;
      }
    }

    return {
      activeCount: enrolled,
      enrolled,
      withDecision,
      pendingReview: Math.max(0, enrolled - withDecision),
      noChange,
      tierChanged,
      needsDiscordUpdate: 0,
    };
  },
});

export const previewQueueDiscordRoleChanges = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return {
      promotions: 0,
      demotions: 0,
      accessRemovals: 0,
      retirements: 0,
      queued: 0,
      players: [],
    };
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
