import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { logAudit } from "../helpers/audit";
import { getDisplayName } from "../auth_helpers";
import {
  FIVE_DAYS_MS,
  TRACKER_PROBLEM_STATUSES,
  type FinalDecision,
  type ReEvalStatus,
  type TrackerStatus,
} from "./constants";
import { getDiscordTierRoleFromRoles } from "../lib/tierDiscordRoles";

export function defaultTrackerLink(epicUsername: string): string {
  return `https://fortnitetracker.com/profile/all/${encodeURIComponent(epicUsername)}`;
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
  if (!trackerLink?.trim()) return "missing";
  return "public";
}

export function memberResponseBlocksDeadline(
  memberResponse: Doc<"bigSummerReEval">["memberResponse"],
): boolean {
  return memberResponse === "no" || memberResponse === "unset" || !memberResponse;
}

export function trackerStillProblematic(trackerStatus: TrackerStatus): boolean {
  return TRACKER_PROBLEM_STATUSES.includes(trackerStatus);
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
  if (finalDecision === "remove_access" || finalDecision === "retired") return true;
  return finalDecision !== currentTier;
}

export function queueActionForDecision(
  finalDecision: FinalDecision,
): Doc<"tierRoleChangeQueue">["action"] {
  if (finalDecision === "remove_access") return "remove_access";
  if (finalDecision === "retired") return "retire";
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
    epicUsername: player.epicUsername,
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
  };
}

export async function getAdminDisplayName(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  const user = await ctx.db.get(userId);
  return user ? getDisplayName(user) : "Unknown";
}
