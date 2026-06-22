import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireAdmin } from "../auth_helpers";
import type { DashboardFilter } from "./constants";
import {
  enrichPlayerRow,
  getAcceptedApplicationTrackerLink,
  getReEvalByPlayerId,
  computeQueueCandidates,
  summarizeQueueCandidates,
  isNeedsAction,
  countActivePlayersForReEval,
  countEnrolledActivePlayers,
} from "./helpers";

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
  row: {
    trackerStatus: string;
    reEvalStatus: string;
    fortniteTrackerLink?: string;
    finalDecision?: string;
    currentTier?: string;
    queueStatus: string | null;
  },
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs_action":
      return isNeedsAction(row);
    case "needs_tracker_link":
      return !row.fortniteTrackerLink?.trim();
    case "private_tracker":
      return row.trackerStatus === "private";
    case "missing_tracker":
      return row.trackerStatus === "missing";
    case "waiting_for_public_tracker":
      return (
        row.trackerStatus === "waiting_for_public_tracker" ||
        row.trackerStatus === "waiting_for_public_tracker_extended" ||
        row.reEvalStatus === "waiting_initial_5_days" ||
        row.reEvalStatus === "extended_final_5_days"
      );
    case "deadline_passed":
      return (
        row.reEvalStatus === "deadline_passed" ||
        row.reEvalStatus === "extension_deadline_passed"
      );
    case "ready_to_review":
      return row.reEvalStatus === "ready_to_review";
    case "reviewed":
      return row.reEvalStatus === "reviewed" || !!row.finalDecision;
    case "no_change":
      return (
        row.finalDecision === "no_change" ||
        (!!row.finalDecision &&
          !!row.currentTier &&
          row.finalDecision === row.currentTier)
      );
    case "tier_changes":
      return (
        row.reEvalStatus === "tier_change_queued" ||
        row.reEvalStatus === "tier_change_complete" ||
        row.reEvalStatus === "tier_change_failed" ||
        row.finalDecision === "S" ||
        row.finalDecision === "A" ||
        row.finalDecision === "B" ||
        row.finalDecision === "C"
      );
    case "access_removal_queue":
      return (
        row.reEvalStatus === "queued_for_access_removal" ||
        row.queueStatus === "pending" ||
        row.queueStatus === "processing"
      ) && (row.finalDecision === "remove_access" || row.reEvalStatus === "queued_for_access_removal");
    case "access_removed":
      return row.reEvalStatus === "access_removed" || row.finalDecision === "remove_access";
    case "retired":
      return row.reEvalStatus === "retired" || row.finalDecision === "retired";
    default:
      return true;
  }
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

export const getFilterCounts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const filters: DashboardFilter[] = [
      "all",
      "needs_action",
      "needs_tracker_link",
      "private_tracker",
      "missing_tracker",
      "waiting_for_public_tracker",
      "deadline_passed",
      "ready_to_review",
      "reviewed",
      "no_change",
      "tier_changes",
      "access_removal_queue",
      "access_removed",
      "retired",
    ];

    const reEvalRows = await ctx.db.query("bigSummerReEval").collect();
    const counts: Record<string, number> = Object.fromEntries(
      filters.map((f) => [f, 0]),
    );

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

      for (const filter of filters) {
        if (matchesFilter(filter, row)) {
          counts[filter] += 1;
        }
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
