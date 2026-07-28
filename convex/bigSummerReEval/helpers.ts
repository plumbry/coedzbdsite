import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { logAudit } from "../helpers/audit";
import { getDisplayName } from "../auth_helpers";
import {
  FIVE_DAYS_MS,
  QUEUE_ACTION_REASONS,
  TRACKER_PROBLEM_STATUSES,
  type FinalDecision,
  type TriageOutcome,
  type ReEvalStatus,
  type TrackerStatus,
} from "./constants";
import { getDiscordTierRoleFromRoles, hasYuniteVerifiedRole } from "../lib/tierDiscordRoles";

const RECENT_JOIN_MS = 30 * 24 * 60 * 60 * 1000;

export function isSummerReEvalEligible(
  player: Pick<Doc<"players">, "status" | "currentMembershipStatus" | "discordRoles">,
): boolean {
  return (
    player.status === "active" &&
    player.currentMembershipStatus === "accepted" &&
    hasYuniteVerifiedRole(player.discordRoles)
  );
}

export function defaultTrackerLink(identifier: string): string {
  return `https://fortnitetracker.com/profile/all/${encodeURIComponent(identifier)}`;
}

/** Discord server nickname is the Epic display name when present. */
export function resolveTrackerEpicUsername(
  player: Pick<Doc<"players">, "nickname" | "epicUsername" | "discordUsername">,
): string {
  const nickname = player.nickname?.trim();
  if (nickname) return nickname;
  const epicUsername = player.epicUsername?.trim();
  if (epicUsername) return epicUsername;
  return player.discordUsername.trim();
}

export function isTrackerLinkManuallySet(reEval: Doc<"bigSummerReEval">): boolean {
  return reEval.trackerLinkManuallySet === true;
}

/**
 * Prefer Yunite Epic account ID for stable Fortnite Tracker URLs.
 * Falls back to nickname / epic username / application link when epicId is missing.
 */
export async function resolveAutoTrackerLink(
  ctx: QueryCtx | MutationCtx,
  player: Doc<"players">,
): Promise<string | undefined> {
  const epicId = player.epicId?.trim();
  if (epicId) {
    return defaultTrackerLink(epicId);
  }

  const nickname = player.nickname?.trim();
  if (nickname) {
    return defaultTrackerLink(nickname);
  }

  const epicUsername = resolveTrackerEpicUsername(player);
  if (!epicUsername) return undefined;

  const appLink = await getAcceptedApplicationTrackerLink(ctx, player._id);
  return appLink ?? defaultTrackerLink(epicUsername);
}

export async function resolveTrackerLinkForReEval(
  ctx: QueryCtx | MutationCtx,
  player: Doc<"players">,
  reEval: Doc<"bigSummerReEval">,
): Promise<string | undefined> {
  if (isTrackerLinkManuallySet(reEval) && reEval.fortniteTrackerLink?.trim()) {
    return reEval.fortniteTrackerLink.trim();
  }
  return resolveAutoTrackerLink(ctx, player);
}

export async function getReEvalByPlayerId(
  ctx: QueryCtx | MutationCtx,
  playerId: Id<"players">,
) {
  return ctx.db
    .query("bigSummerReEval")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .first();
}

export async function getAcceptedApplicationTrackerLink(
  ctx: QueryCtx | MutationCtx,
  playerId: Id<"players">,
): Promise<string | undefined> {
  const application = await ctx.db
    .query("applications")
    .withIndex("by_player_id", (q) => q.eq("playerId", playerId))
    .filter((q) => q.eq(q.field("status"), "accepted"))
    .first();
  return application?.fortniteProfileLink;
}

export function inferInitialTrackerStatus(
  trackerLink: string | undefined,
): TrackerStatus {
  if (!trackerLink?.trim()) return "private";
  return "public";
}

export function normalizeFortniteTrackerLink(link: string): string {
  const trimmed = link.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function syncAcceptedApplicationTrackerLink(
  ctx: MutationCtx,
  playerId: Id<"players">,
  fortniteTrackerLink: string,
) {
  const application = await ctx.db
    .query("applications")
    .withIndex("by_player_id", (q) => q.eq("playerId", playerId))
    .filter((q) => q.eq(q.field("status"), "accepted"))
    .first();
  if (application && application.fortniteProfileLink !== fortniteTrackerLink) {
    await ctx.db.patch(application._id, { fortniteProfileLink: fortniteTrackerLink });
  }
}

export function memberResponseBlocksDeadline(
  memberResponse: Doc<"bigSummerReEval">["memberResponse"],
): boolean {
  return memberResponse === "no" || memberResponse === "unset" || !memberResponse;
}

export function trackerStillProblematic(trackerStatus: string): boolean {
  return (TRACKER_PROBLEM_STATUSES as readonly string[]).includes(trackerStatus);
}

export async function writeReEvalAudit(
  ctx: MutationCtx,
  params: {
    userId: Id<"users">;
    userName?: string;
    action: string;
    playerId?: Id<"players">;
    reEvalId?: Id<"bigSummerReEval">;
    previousValue?: string;
    newValue?: string;
    details?: string;
  },
) {
  await logAudit(ctx, {
    userId: params.userId,
    userName: params.userName,
    action: params.action,
    entityType: "big_summer_reeval",
    entityId: params.reEvalId ?? params.playerId,
    previousValue: params.previousValue,
    newValue: params.newValue,
    details: params.details,
  });
}

export async function writeSystemReEvalAudit(
  ctx: MutationCtx,
  params: {
    action: string;
    playerId: Id<"players">;
    reEvalId?: Id<"bigSummerReEval">;
    previousValue?: string;
    newValue?: string;
    details?: string;
  },
) {
  const systemUser = await ctx.db.query("users").first();
  if (!systemUser) return;
  await logAudit(ctx, {
    userId: systemUser._id,
    userName: "System",
    action: params.action,
    entityType: "big_summer_reeval",
    entityId: params.reEvalId ?? params.playerId,
    previousValue: params.previousValue,
    newValue: params.newValue,
    details: params.details,
  });
}

export function startTrackerDeadline(now: number) {
  return {
    trackerRequestSentAt: now,
    deadlineAt: now + FIVE_DAYS_MS,
    reEvalStatus: "waiting_initial_5_days" as ReEvalStatus,
  };
}

export async function hasActiveQueueItem(
  ctx: QueryCtx | MutationCtx,
  playerId: Id<"players">,
  statuses: Array<"pending" | "processing" | "completed"> = ["pending", "processing"],
) {
  for (const status of statuses) {
    const existing = await ctx.db
      .query("tierRoleChangeQueue")
      .withIndex("by_player_and_status", (q) =>
        q.eq("playerId", playerId).eq("status", status),
      )
      .first();
    if (existing) return existing;
  }
  return null;
}

export async function hasCompletedQueueForDecision(
  ctx: QueryCtx | MutationCtx,
  playerId: Id<"players">,
  action: Doc<"tierRoleChangeQueue">["action"],
  targetTier?: string,
) {
  const completed = await ctx.db
    .query("tierRoleChangeQueue")
    .withIndex("by_player_and_status", (q) =>
      q.eq("playerId", playerId).eq("status", "completed"),
    )
    .collect();
  return completed.some((item) => {
    if (item.action !== action) return false;
    if (action === "change_tier" && targetTier) {
      return item.targetTier === targetTier;
    }
    return true;
  });
}

export function decisionNeedsQueue(
  finalDecision: FinalDecision,
  currentTier: string | undefined,
): boolean {
  if (finalDecision === "no_change") return false;
  if (finalDecision === "remove_access") return true;
  return finalDecision !== currentTier;
}

export function queueActionForDecision(
  finalDecision: FinalDecision,
): Doc<"tierRoleChangeQueue">["action"] {
  if (finalDecision === "remove_access") return "remove_access";
  if (finalDecision === "no_change") return "no_change";
  return "change_tier";
}

export function enrichPlayerRow(
  reEval: Doc<"bigSummerReEval">,
  player: Doc<"players">,
  trackerLink: string | undefined,
  queueStatus: string | null,
) {
  const discordTierRole = getDiscordTierRoleFromRoles(player.discordRoles);
  return {
    _id: reEval._id,
    playerId: player._id,
    playerName: player.name || player.nickname || player.discordUsername,
    discordId: player.discordUserId,
    discordUsername: player.discordUsername,
    epicId: player.epicId,
    epicUsername: resolveTrackerEpicUsername(player),
    fortniteTrackerLink: trackerLink ?? reEval.fortniteTrackerLink,
    currentTier: player.tier,
    currentDiscordTierRole: discordTierRole?.name ?? null,
    trackerStatus: reEval.trackerStatus,
    reEvalStatus: reEval.reEvalStatus,
    deadlineAt: reEval.deadlineAt,
    assignedAdminId: reEval.assignedAdminId,
    assignedAdminName: reEval.assignedAdminName,
    memberResponse: reEval.memberResponse ?? "unset",
    finalDecision: reEval.finalDecision,
    evaluationStatus: reEval.evaluationStatus,
    evaluationStatusRaw: reEval.evaluationStatusRaw,
    evaluationTargetTier: reEval.evaluationTargetTier,
    evaluatedAt: reEval.evaluatedAt,
    triageOutcome: reEval.triageOutcome,
    triageSuggestedOutcome: reEval.triageSuggestedOutcome,
    triageSuggestionReason: reEval.triageSuggestionReason,
    triagedAt: reEval.triagedAt,
    summerTotalScore: reEval.summerScore?.totalScore,
    summerTier: reEval.summerScore?.tier,
    appliedAt: reEval.appliedAt,
    appliedTier: reEval.appliedTier,
    queueStatus,
    lastUpdatedAt: reEval.lastUpdatedAt,
    notes: reEval.notes,
    trackerRequestSentAt: reEval.trackerRequestSentAt,
    extensionCount: reEval.extensionCount ?? 0,
    extensionGranted: reEval.extensionGranted ?? false,
    dmSentAt: reEval.dmSentAt,
    ticketSentAt: reEval.ticketSentAt,
    playerStatus: player.status,
    membershipStatus: player.currentMembershipStatus,
    eventsPlayedCount: player.eventsPlayedCount ?? 0,
    hasMatchData: player.hasMatchData ?? false,
  };
}

function suggestTriageOutcome(
  reEval: Doc<"bigSummerReEval">,
  player: Doc<"players">,
  trackerLink: string | undefined,
): { outcome: TriageOutcome; reason: string } {
  const eventsPlayed = player.eventsPlayedCount ?? 0;
  const joinedAt = Date.parse(player.serverJoinDate);
  const recentlyJoined =
    !Number.isNaN(joinedAt) && Date.now() - joinedAt <= RECENT_JOIN_MS;
  if (recentlyJoined) {
    return {
      outcome: "no_change",
      reason: "Recently joined member with limited activity history.",
    };
  }
  if (!trackerLink?.trim()) {
    return {
      outcome: "private_tracker",
      reason: "Tracker unavailable.",
    };
  }
  if (player.tier === "C" && eventsPlayed === 0) {
    return {
      outcome: "no_change",
      reason: "Current C Tier with 0 ZBD events.",
    };
  }
  if (
    reEval.evaluationStatus?.includes("Promotion") ||
    reEval.evaluationStatus?.includes("Demotion") ||
    reEval.summerScore
  ) {
    return {
      outcome: "needs_full_review",
      reason: reEval.evaluationStatus ?? "Existing Summer evaluation needs manual review.",
    };
  }
  if (player.hasMatchData || eventsPlayed >= 3) {
    return {
      outcome: "needs_full_review",
      reason: "Player has ZBD/Yunite activity that may need manual judgement.",
    };
  }
  return {
    outcome: "no_change",
    reason: "No evidence currently suggests a tier change.",
  };
}

function searchTextForDashboardRow(row: {
  playerName: string;
  discordUsername: string;
  discordId: string;
  epicUsername: string;
  currentTier?: string;
  assignedAdminName?: string;
  notes?: string;
}) {
  return [
    row.playerName,
    row.discordUsername,
    row.discordId,
    row.epicUsername,
    row.currentTier,
    row.assignedAdminName,
    row.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function upsertDashboardCacheRow(
  ctx: MutationCtx,
  reEval: Doc<"bigSummerReEval">,
  player: Doc<"players">,
  trackerLink: string | undefined,
) {
  const row = enrichPlayerRow(reEval, player, trackerLink, null);
  const triageSuggestion = suggestTriageOutcome(reEval, player, trackerLink);
  const isActiveAccepted = isSummerReEvalEligible(player);
  const cachedAt = Date.now();
  const patch = {
    reEvalId: reEval._id,
    playerId: player._id,
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
    triageOutcome: row.triageOutcome,
    triageSuggestedOutcome: triageSuggestion.outcome,
    triageSuggestionReason: triageSuggestion.reason,
    triagedAt: row.triagedAt,
    summerTotalScore: row.summerTotalScore,
    summerTier: row.summerTier,
    eventsPlayedCount: row.eventsPlayedCount,
    hasMatchData: row.hasMatchData,
    appliedAt: row.appliedAt,
    appliedTier: row.appliedTier,
    notes: row.notes,
    searchText: searchTextForDashboardRow(row),
    isActiveAccepted,
    lastUpdatedAt: row.lastUpdatedAt,
    cachedAt,
  };

  const existing = await ctx.db
    .query("bigSummerReEvalDashboardCache")
    .withIndex("by_re_eval", (q) => q.eq("reEvalId", reEval._id))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, patch);
  } else {
    await ctx.db.insert("bigSummerReEvalDashboardCache", patch);
  }
}

export async function syncDashboardCacheForReEval(
  ctx: MutationCtx,
  reEvalId: Id<"bigSummerReEval">,
) {
  let reEval = await ctx.db.get(reEvalId);
  if (!reEval) return;
  const player = await ctx.db.get(reEval.playerId);
  if (!player) return;

  const trackerLink = await resolveTrackerLinkForReEval(ctx, player, reEval);
  if (
    !isTrackerLinkManuallySet(reEval) &&
    trackerLink &&
    reEval.fortniteTrackerLink !== trackerLink
  ) {
    await ctx.db.patch(reEvalId, {
      fortniteTrackerLink: trackerLink,
      lastUpdatedAt: Date.now(),
    });
    reEval = { ...reEval, fortniteTrackerLink: trackerLink };
  }

  await upsertDashboardCacheRow(ctx, reEval, player, trackerLink);
}

export async function syncDashboardCacheForPlayer(
  ctx: MutationCtx,
  playerId: Id<"players">,
) {
  await ensurePlayerEnrolledInReEval(ctx, playerId);
  const reEval = await getReEvalByPlayerId(ctx, playerId);
  if (!reEval) return;
  await syncDashboardCacheForReEval(ctx, reEval._id);
}

export async function rebuildDashboardCache(
  ctx: MutationCtx,
): Promise<{ cached: number }> {
  const reEvalRows = await ctx.db.query("bigSummerReEval").collect();
  let cached = 0;
  for (const reEval of reEvalRows) {
    await syncDashboardCacheForReEval(ctx, reEval._id);
    cached += 1;
  }
  return { cached };
}

export async function getAdminDisplayName(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  const user = await ctx.db.get(userId);
  return user ? getDisplayName(user) : "Unknown";
}

export function isNeedsAction(row: {
  reEvalStatus: string;
  queueStatus: string | null;
}): boolean {
  return (
    row.reEvalStatus === "deadline_passed" ||
    row.reEvalStatus === "extension_deadline_passed" ||
    row.reEvalStatus === "tier_change_failed" ||
    row.queueStatus === "failed"
  );
}

export type QueueCandidate = {
  reEvalId: Id<"bigSummerReEval">;
  playerId: Id<"players">;
  playerName: string;
  discordId: string;
  currentTier?: string;
  targetTier?: string;
  action: Doc<"tierRoleChangeQueue">["action"];
  newReEvalStatus: ReEvalStatus;
};

export type QueuePreviewSummary = {
  promotions: number;
  demotions: number;
  accessRemovals: number;
  retirements: number;
  queued: number;
  players: Array<{
    playerName: string;
    currentTier?: string;
    targetTier?: string;
    action: Doc<"tierRoleChangeQueue">["action"];
  }>;
};

const TIER_ORDER = ["S", "A", "B", "C", "D"];

export async function computeQueueCandidates(
  ctx: QueryCtx | MutationCtx,
): Promise<QueueCandidate[]> {
  const reEvalRows = await ctx.db.query("bigSummerReEval").collect();
  const candidates: QueueCandidate[] = [];

  for (const reEval of reEvalRows) {
    if (!reEval.finalDecision) continue;
    const decision = reEval.finalDecision as FinalDecision;
    const player = await ctx.db.get(reEval.playerId);
    if (!player) continue;

    if (!decisionNeedsQueue(decision, player.tier)) continue;

    const action = queueActionForDecision(decision);
    const targetTier = action === "change_tier" ? decision : undefined;

    const activeQueue = await hasActiveQueueItem(ctx, player._id);
    if (activeQueue) continue;

    const alreadyCompleted = await hasCompletedQueueForDecision(
      ctx,
      player._id,
      action,
      targetTier,
    );
    if (alreadyCompleted) continue;

    const newReEvalStatus: ReEvalStatus =
      action === "remove_access" ? "queued_for_access_removal" : "tier_change_queued";

    candidates.push({
      reEvalId: reEval._id,
      playerId: player._id,
      playerName: player.name || player.discordUsername,
      discordId: player.discordUserId,
      currentTier: player.tier,
      targetTier,
      action,
      newReEvalStatus,
    });
  }

  return candidates;
}

export function summarizeQueueCandidates(
  candidates: QueueCandidate[],
): QueuePreviewSummary {
  let promotions = 0;
  let demotions = 0;
  let accessRemovals = 0;
  let retirements = 0;

  const players = candidates.map((candidate) => {
    if (candidate.action === "change_tier" && candidate.targetTier && candidate.currentTier) {
      const oldIdx = TIER_ORDER.indexOf(candidate.currentTier);
      const newIdx = TIER_ORDER.indexOf(candidate.targetTier);
      if (newIdx < oldIdx) promotions += 1;
      else if (newIdx > oldIdx) demotions += 1;
    } else if (candidate.action === "remove_access") {
      accessRemovals += 1;
    } else if (candidate.action === "retire") {
      retirements += 1;
    }

    return {
      playerName: candidate.playerName,
      currentTier: candidate.currentTier,
      targetTier: candidate.targetTier,
      action: candidate.action,
    };
  });

  return {
    promotions,
    demotions,
    accessRemovals,
    retirements,
    queued: candidates.length,
    players,
  };
}

export function queueReasonForAction(
  action: Doc<"tierRoleChangeQueue">["action"],
): string {
  if (action === "remove_access") return QUEUE_ACTION_REASONS.accessRemoval;
  if (action === "retire") return QUEUE_ACTION_REASONS.retire;
  return QUEUE_ACTION_REASONS.tierChange;
}

export async function ensurePlayerEnrolledInReEval(
  ctx: MutationCtx,
  playerId: Id<"players">,
  playerDoc?: Doc<"players">,
): Promise<boolean> {
  const player = playerDoc ?? (await ctx.db.get(playerId));
  if (!player) return false;
  if (!isSummerReEvalEligible(player)) {
    return false;
  }

  const existing = await getReEvalByPlayerId(ctx, playerId);
  if (existing) return false;

  const trackerLink = await resolveAutoTrackerLink(ctx, player);
  const now = Date.now();

  const reEvalId = await ctx.db.insert("bigSummerReEval", {
    playerId,
    trackerStatus: inferInitialTrackerStatus(trackerLink),
    reEvalStatus: "unchecked",
    fortniteTrackerLink: trackerLink,
    trackerLinkManuallySet: false,
    memberResponse: "unset",
    lastUpdatedAt: now,
  });
  await upsertDashboardCacheRow(
    ctx,
    {
      _id: reEvalId,
      _creationTime: now,
      playerId,
      trackerStatus: inferInitialTrackerStatus(trackerLink),
      reEvalStatus: "unchecked",
      fortniteTrackerLink: trackerLink,
      trackerLinkManuallySet: false,
      memberResponse: "unset",
      lastUpdatedAt: now,
    },
    player,
    trackerLink,
  );
  return true;
}

/**
 * Enroll eligible accepted members missing a Summer Re-Eval row.
 * Skips a full dashboard-cache rebuild — that path exceeds the 4096-read limit
 * at ~800 members. Newly created rows get a cache upsert instead.
 */
export async function ensureAllActivePlayersEnrolled(
  ctx: MutationCtx,
): Promise<{ created: number; enrolled: number; cached: number }> {
  const activePlayers = await ctx.db
    .query("players")
    .withIndex("by_membership_status", (q) =>
      q.eq("currentMembershipStatus", "accepted"),
    )
    .collect();

  const existingReEvals = await ctx.db.query("bigSummerReEval").collect();
  const enrolledPlayerIds = new Set(existingReEvals.map((row) => row.playerId));

  let created = 0;
  let enrolled = 0;
  let cached = 0;
  for (const player of activePlayers) {
    if (!isSummerReEvalEligible(player)) continue;
    enrolled += 1;
    if (enrolledPlayerIds.has(player._id)) continue;

    const wasCreated = await ensurePlayerEnrolledInReEval(ctx, player._id, player);
    if (wasCreated) {
      created += 1;
      cached += 1;
      enrolledPlayerIds.add(player._id);
    }
  }

  return { created, enrolled, cached };
}

/** Paginated enrollment for callers that need to stay under read limits. */
export async function ensureActivePlayersEnrolledPage(
  ctx: MutationCtx,
  opts: { cursor?: string | null; numItems?: number },
): Promise<{
  created: number;
  enrolled: number;
  cached: number;
  isDone: boolean;
  continueCursor: string | null;
}> {
  const page = await ctx.db
    .query("players")
    .withIndex("by_membership_status", (q) =>
      q.eq("currentMembershipStatus", "accepted"),
    )
    .paginate({
      numItems: opts.numItems ?? 80,
      cursor: opts.cursor ?? null,
    });

  let created = 0;
  let enrolled = 0;
  let cached = 0;
  for (const player of page.page) {
    if (!isSummerReEvalEligible(player)) continue;
    enrolled += 1;
    const wasCreated = await ensurePlayerEnrolledInReEval(ctx, player._id, player);
    if (wasCreated) {
      created += 1;
      cached += 1;
    }
  }

  return {
    created,
    enrolled,
    cached,
    isDone: page.isDone,
    continueCursor: page.isDone ? null : page.continueCursor,
  };
}

export async function countActivePlayersForReEval(ctx: QueryCtx | MutationCtx) {
  const activePlayers = await ctx.db
    .query("players")
    .withIndex("by_membership_status", (q) => q.eq("currentMembershipStatus", "accepted"))
    .collect();
  return activePlayers.filter((player) => isSummerReEvalEligible(player)).length;
}

export async function countEnrolledActivePlayers(ctx: QueryCtx | MutationCtx) {
  const reEvalRows = await ctx.db.query("bigSummerReEval").collect();
  let enrolled = 0;
  for (const reEval of reEvalRows) {
    const player = await ctx.db.get(reEval.playerId);
    if (!player) continue;
    if (player && isSummerReEvalEligible(player)) {
      enrolled += 1;
    }
  }
  return enrolled;
}
