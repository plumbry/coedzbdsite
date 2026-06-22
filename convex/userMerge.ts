import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getDisplayName, requireAdmin } from "./auth_helpers";
import { logAudit } from "./helpers/audit";
import { isUnlinkedMigrationUser } from "./userProvisioning";

type UserRole = NonNullable<Doc<"users">["role"]>;

const ROLE_PRIORITY: Record<UserRole | "viewer", number> = {
  admin: 4,
  event_mod: 3,
  analytics: 2,
  viewer: 1,
};

function normalizeEmail(email: string | undefined): string | undefined {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || undefined;
}

function effectiveRole(role: Doc<"users">["role"]): UserRole | "viewer" {
  return role ?? "viewer";
}

function pickHigherRole(
  a: Doc<"users">["role"],
  b: Doc<"users">["role"],
): Doc<"users">["role"] | undefined {
  const aRole = effectiveRole(a);
  const bRole = effectiveRole(b);
  if (ROLE_PRIORITY[aRole] >= ROLE_PRIORITY[bRole]) {
    return a ?? undefined;
  }
  return b ?? undefined;
}

function pickNonEmpty<T>(primary: T | undefined, secondary: T | undefined): T | undefined {
  if (primary !== undefined && primary !== null && primary !== "") {
    return primary;
  }
  return secondary;
}

function pickDiscordUserId(
  primary: Doc<"users">,
  secondary: Doc<"users">,
): string | undefined {
  const primaryLinked = !isUnlinkedMigrationUser(primary) && primary.discordUserId;
  const secondaryLinked = !isUnlinkedMigrationUser(secondary) && secondary.discordUserId;

  if (primaryLinked) return primary.discordUserId;
  if (secondaryLinked) return secondary.discordUserId;
  return pickNonEmpty(primary.discordUserId, secondary.discordUserId);
}

export async function countUserReferences(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  const auditLogs = await ctx.db
    .query("auditLogs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  counts.auditLogs = auditLogs.length;

  const passports = await ctx.db
    .query("seasonalPassports")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  counts.seasonalPassports = passports.length;

  const replays = await ctx.db
    .query("replays")
    .withIndex("by_uploaded_by", (q) => q.eq("uploadedBy", userId))
    .collect();
  counts.replays = replays.length;

  const players = await ctx.db.query("players").collect();
  counts.playersCreated = players.filter((row) => row.createdBy === userId).length;

  const manualScores = await ctx.db.query("manualScores").collect();
  counts.manualScoresEvaluated = manualScores.filter(
    (row) => row.evaluatedBy === userId,
  ).length;

  const applications = await ctx.db.query("applications").collect();
  counts.applicationsProcessed = applications.filter(
    (row) => row.processedBy === userId,
  ).length;

  const statusEvents = await ctx.db.query("statusEvents").collect();
  counts.statusEvents = statusEvents.filter((row) => row.performedBy === userId).length;

  const eventResults = await ctx.db.query("eventResults").collect();
  counts.eventResults = eventResults.filter((row) => row.createdBy === userId).length;

  const tierHistory = await ctx.db.query("tierHistory").collect();
  counts.tierHistory = tierHistory.filter((row) => row.changedBy === userId).length;

  const thirdPartyImports = await ctx.db.query("thirdPartyImports").collect();
  counts.thirdPartyImports =
    thirdPartyImports.filter(
      (row) => row.importedBy === userId || row.finalizedBy === userId,
    ).length;

  const importProcessingJobs = await ctx.db.query("importProcessingJobs").collect();
  counts.importProcessingJobs = importProcessingJobs.filter(
    (row) => row.startedBy === userId,
  ).length;

  const events = await ctx.db.query("events").collect();
  counts.events = events.filter((row) => row.createdBy === userId).length;

  const seasonalCampaigns = await ctx.db.query("seasonalCampaigns").collect();
  counts.seasonalCampaigns = seasonalCampaigns.filter(
    (row) => row.createdBy === userId || row.updatedBy === userId,
  ).length;

  const seasonalCampaignEvents = await ctx.db.query("seasonalCampaignEvents").collect();
  counts.seasonalCampaignEvents = seasonalCampaignEvents.filter(
    (row) => row.createdBy === userId || row.updatedBy === userId,
  ).length;

  const seasonalQuests = await ctx.db.query("seasonalQuests").collect();
  counts.seasonalQuests = seasonalQuests.filter(
    (row) => row.createdBy === userId || row.updatedBy === userId,
  ).length;

  const seasonalQuestSubmissions = await ctx.db
    .query("seasonalQuestSubmissions")
    .collect();
  counts.seasonalQuestSubmissions = seasonalQuestSubmissions.filter(
    (row) => row.reviewedBy === userId,
  ).length;

  const seasonalQuestAuditLogs = await ctx.db.query("seasonalQuestAuditLogs").collect();
  counts.seasonalQuestAuditLogs = seasonalQuestAuditLogs.filter(
    (row) => row.adminId === userId,
  ).length;

  const supportTickets = await ctx.db.query("supportTickets").collect();
  counts.supportTickets = supportTickets.filter((row) => row.archivedBy === userId).length;

  const matchEliminationOverrides = await ctx.db
    .query("matchEliminationOverrides")
    .collect();
  counts.matchEliminationOverrides = matchEliminationOverrides.filter(
    (row) => row.editedBy === userId,
  ).length;

  return counts;
}

async function reassignUserReferences(
  ctx: MutationCtx,
  fromUserId: Id<"users">,
  toUserId: Id<"users">,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  const auditLogs = await ctx.db
    .query("auditLogs")
    .withIndex("by_user", (q) => q.eq("userId", fromUserId))
    .collect();
  for (const row of auditLogs) {
    await ctx.db.patch(row._id, { userId: toUserId });
  }
  counts.auditLogs = auditLogs.length;

  const passports = await ctx.db
    .query("seasonalPassports")
    .withIndex("by_user", (q) => q.eq("userId", fromUserId))
    .collect();
  let passportsReassigned = 0;
  let passportsDeleted = 0;
  for (const passport of passports) {
    const existingForPlayer = await ctx.db
      .query("seasonalPassports")
      .withIndex("by_campaign_and_player", (q) =>
        q.eq("campaignId", passport.campaignId).eq("playerId", passport.playerId),
      )
      .first();

    if (existingForPlayer && existingForPlayer._id !== passport._id) {
      await ctx.db.delete(passport._id);
      passportsDeleted += 1;
    } else {
      await ctx.db.patch(passport._id, { userId: toUserId });
      passportsReassigned += 1;
    }
  }
  counts.seasonalPassports = passportsReassigned;
  counts.seasonalPassportsDeleted = passportsDeleted;

  const replays = await ctx.db
    .query("replays")
    .withIndex("by_uploaded_by", (q) => q.eq("uploadedBy", fromUserId))
    .collect();
  for (const row of replays) {
    await ctx.db.patch(row._id, { uploadedBy: toUserId });
  }
  counts.replays = replays.length;

  const players = await ctx.db.query("players").collect();
  let playersUpdated = 0;
  for (const row of players) {
    if (row.createdBy === fromUserId) {
      await ctx.db.patch(row._id, { createdBy: toUserId });
      playersUpdated += 1;
    }
  }
  counts.playersCreated = playersUpdated;

  const manualScores = await ctx.db.query("manualScores").collect();
  let manualScoresUpdated = 0;
  for (const row of manualScores) {
    if (row.evaluatedBy === fromUserId) {
      await ctx.db.patch(row._id, { evaluatedBy: toUserId });
      manualScoresUpdated += 1;
    }
  }
  counts.manualScoresEvaluated = manualScoresUpdated;

  const applications = await ctx.db.query("applications").collect();
  let applicationsUpdated = 0;
  for (const row of applications) {
    if (row.processedBy === fromUserId) {
      await ctx.db.patch(row._id, { processedBy: toUserId });
      applicationsUpdated += 1;
    }
  }
  counts.applicationsProcessed = applicationsUpdated;

  const statusEvents = await ctx.db.query("statusEvents").collect();
  let statusEventsUpdated = 0;
  for (const row of statusEvents) {
    if (row.performedBy === fromUserId) {
      await ctx.db.patch(row._id, { performedBy: toUserId });
      statusEventsUpdated += 1;
    }
  }
  counts.statusEvents = statusEventsUpdated;

  const eventResults = await ctx.db.query("eventResults").collect();
  let eventResultsUpdated = 0;
  for (const row of eventResults) {
    if (row.createdBy === fromUserId) {
      await ctx.db.patch(row._id, { createdBy: toUserId });
      eventResultsUpdated += 1;
    }
  }
  counts.eventResults = eventResultsUpdated;

  const tierHistory = await ctx.db.query("tierHistory").collect();
  let tierHistoryUpdated = 0;
  for (const row of tierHistory) {
    if (row.changedBy === fromUserId) {
      await ctx.db.patch(row._id, { changedBy: toUserId });
      tierHistoryUpdated += 1;
    }
  }
  counts.tierHistory = tierHistoryUpdated;

  const thirdPartyImports = await ctx.db.query("thirdPartyImports").collect();
  let thirdPartyImportsUpdated = 0;
  for (const row of thirdPartyImports) {
    const patch: { importedBy?: Id<"users">; finalizedBy?: Id<"users"> } = {};
    if (row.importedBy === fromUserId) {
      patch.importedBy = toUserId;
    }
    if (row.finalizedBy === fromUserId) {
      patch.finalizedBy = toUserId;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(row._id, patch);
      thirdPartyImportsUpdated += 1;
    }
  }
  counts.thirdPartyImports = thirdPartyImportsUpdated;

  const importProcessingJobs = await ctx.db.query("importProcessingJobs").collect();
  let importProcessingJobsUpdated = 0;
  for (const row of importProcessingJobs) {
    if (row.startedBy === fromUserId) {
      await ctx.db.patch(row._id, { startedBy: toUserId });
      importProcessingJobsUpdated += 1;
    }
  }
  counts.importProcessingJobs = importProcessingJobsUpdated;

  const events = await ctx.db.query("events").collect();
  let eventsUpdated = 0;
  for (const row of events) {
    if (row.createdBy === fromUserId) {
      await ctx.db.patch(row._id, { createdBy: toUserId });
      eventsUpdated += 1;
    }
  }
  counts.events = eventsUpdated;

  const seasonalCampaigns = await ctx.db.query("seasonalCampaigns").collect();
  let seasonalCampaignsUpdated = 0;
  for (const row of seasonalCampaigns) {
    const patch: { createdBy?: Id<"users">; updatedBy?: Id<"users"> } = {};
    if (row.createdBy === fromUserId) {
      patch.createdBy = toUserId;
    }
    if (row.updatedBy === fromUserId) {
      patch.updatedBy = toUserId;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(row._id, patch);
      seasonalCampaignsUpdated += 1;
    }
  }
  counts.seasonalCampaigns = seasonalCampaignsUpdated;

  const seasonalCampaignEvents = await ctx.db.query("seasonalCampaignEvents").collect();
  let seasonalCampaignEventsUpdated = 0;
  for (const row of seasonalCampaignEvents) {
    const patch: { createdBy?: Id<"users">; updatedBy?: Id<"users"> } = {};
    if (row.createdBy === fromUserId) {
      patch.createdBy = toUserId;
    }
    if (row.updatedBy === fromUserId) {
      patch.updatedBy = toUserId;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(row._id, patch);
      seasonalCampaignEventsUpdated += 1;
    }
  }
  counts.seasonalCampaignEvents = seasonalCampaignEventsUpdated;

  const seasonalQuests = await ctx.db.query("seasonalQuests").collect();
  let seasonalQuestsUpdated = 0;
  for (const row of seasonalQuests) {
    const patch: { createdBy?: Id<"users">; updatedBy?: Id<"users"> } = {};
    if (row.createdBy === fromUserId) {
      patch.createdBy = toUserId;
    }
    if (row.updatedBy === fromUserId) {
      patch.updatedBy = toUserId;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(row._id, patch);
      seasonalQuestsUpdated += 1;
    }
  }
  counts.seasonalQuests = seasonalQuestsUpdated;

  const seasonalQuestSubmissions = await ctx.db
    .query("seasonalQuestSubmissions")
    .collect();
  let seasonalQuestSubmissionsUpdated = 0;
  for (const row of seasonalQuestSubmissions) {
    if (row.reviewedBy === fromUserId) {
      await ctx.db.patch(row._id, { reviewedBy: toUserId });
      seasonalQuestSubmissionsUpdated += 1;
    }
  }
  counts.seasonalQuestSubmissions = seasonalQuestSubmissionsUpdated;

  const seasonalQuestAuditLogs = await ctx.db.query("seasonalQuestAuditLogs").collect();
  let seasonalQuestAuditLogsUpdated = 0;
  for (const row of seasonalQuestAuditLogs) {
    if (row.adminId === fromUserId) {
      await ctx.db.patch(row._id, { adminId: toUserId });
      seasonalQuestAuditLogsUpdated += 1;
    }
  }
  counts.seasonalQuestAuditLogs = seasonalQuestAuditLogsUpdated;

  const supportTickets = await ctx.db.query("supportTickets").collect();
  let supportTicketsUpdated = 0;
  for (const row of supportTickets) {
    if (row.archivedBy === fromUserId) {
      await ctx.db.patch(row._id, { archivedBy: toUserId });
      supportTicketsUpdated += 1;
    }
  }
  counts.supportTickets = supportTicketsUpdated;

  const matchEliminationOverrides = await ctx.db
    .query("matchEliminationOverrides")
    .collect();
  let matchEliminationOverridesUpdated = 0;
  for (const row of matchEliminationOverrides) {
    if (row.editedBy === fromUserId) {
      await ctx.db.patch(row._id, { editedBy: toUserId });
      matchEliminationOverridesUpdated += 1;
    }
  }
  counts.matchEliminationOverrides = matchEliminationOverridesUpdated;

  return counts;
}

function assertMergeableUsers(
  primary: Doc<"users">,
  secondary: Doc<"users">,
): void {
  if (primary._id === secondary._id) {
    throw new ConvexError({
      message: "Cannot merge a user with itself",
      code: "INVALID_ARGUMENT",
    });
  }

  const primaryEmail = normalizeEmail(primary.email);
  const secondaryEmail = normalizeEmail(secondary.email);
  if (primaryEmail && secondaryEmail && primaryEmail !== secondaryEmail) {
    throw new ConvexError({
      message: "Users must share the same email address to merge",
      code: "INVALID_ARGUMENT",
    });
  }

  if (
    primary.discordUserId &&
    secondary.discordUserId &&
    primary.discordUserId !== secondary.discordUserId
  ) {
    throw new ConvexError({
      message:
        "Both accounts have different Discord IDs. Resolve the Discord link manually before merging.",
      code: "CONFLICT",
    });
  }
}

export const getDuplicateUserEmails = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const users = await ctx.db.query("users").collect();
    const groups = new Map<string, Doc<"users">[]>();

    for (const user of users) {
      const email = normalizeEmail(user.email);
      if (!email) continue;
      const group = groups.get(email) ?? [];
      group.push(user);
      groups.set(email, group);
    }

    return [...groups.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([email, group]) => ({
        email,
        users: group
          .map((user) => ({
            _id: user._id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            discordUserId: user.discordUserId,
            discordUsername: user.discordUsername,
            isClerkLinked: !user.tokenIdentifier.startsWith("https://hercules.app|"),
            _creationTime: user._creationTime,
          }))
          .sort((a, b) => a._creationTime - b._creationTime),
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  },
});

export const previewUserMerge = query({
  args: {
    primaryUserId: v.id("users"),
    secondaryUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const primary = await ctx.db.get(args.primaryUserId);
    const secondary = await ctx.db.get(args.secondaryUserId);
    if (!primary || !secondary) {
      throw new ConvexError({
        message: "One or both users not found",
        code: "NOT_FOUND",
      });
    }

    assertMergeableUsers(primary, secondary);

    const secondaryReferences = await countUserReferences(ctx, args.secondaryUserId);

    return {
      primary: {
        _id: primary._id,
        name: primary.name,
        username: primary.username,
        email: primary.email,
        role: primary.role,
        discordUserId: primary.discordUserId,
        discordUsername: primary.discordUsername,
        isClerkLinked: !primary.tokenIdentifier.startsWith("https://hercules.app|"),
      },
      secondary: {
        _id: secondary._id,
        name: secondary.name,
        username: secondary.username,
        email: secondary.email,
        role: secondary.role,
        discordUserId: secondary.discordUserId,
        discordUsername: secondary.discordUsername,
        isClerkLinked: !secondary.tokenIdentifier.startsWith("https://hercules.app|"),
      },
      mergedRole: pickHigherRole(primary.role, secondary.role),
      referencesReassigned: secondaryReferences,
    };
  },
});

export const mergeUsers = mutation({
  args: {
    primaryUserId: v.id("users"),
    secondaryUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const primary = await ctx.db.get(args.primaryUserId);
    const secondary = await ctx.db.get(args.secondaryUserId);
    if (!primary || !secondary) {
      throw new ConvexError({
        message: "One or both users not found",
        code: "NOT_FOUND",
      });
    }

    if (admin._id === args.secondaryUserId) {
      throw new ConvexError({
        message: "You cannot merge away the account you are currently signed in with",
        code: "BAD_REQUEST",
      });
    }

    assertMergeableUsers(primary, secondary);

    const referencesReassigned = await reassignUserReferences(
      ctx,
      args.secondaryUserId,
      args.primaryUserId,
    );

    const mergedRole = pickHigherRole(primary.role, secondary.role);
    const discordUserId = pickDiscordUserId(primary, secondary);

    await ctx.db.patch(args.primaryUserId, {
      name: pickNonEmpty(primary.name, secondary.name),
      email: pickNonEmpty(primary.email, secondary.email),
      username: pickNonEmpty(primary.username, secondary.username),
      role: mergedRole,
      discordUserId,
      discordUsername: pickNonEmpty(
        primary.discordUsername,
        secondary.discordUsername,
      ),
      lastAnalyticsStatsRefreshAt: Math.max(
        primary.lastAnalyticsStatsRefreshAt ?? 0,
        secondary.lastAnalyticsStatsRefreshAt ?? 0,
      ) || undefined,
    });

    await ctx.db.delete(args.secondaryUserId);

    const secondaryLabel =
      secondary.username || secondary.email || secondary.name || args.secondaryUserId;
    const primaryLabel =
      primary.username || primary.email || primary.name || args.primaryUserId;

    await logAudit(ctx, {
      userId: admin._id,
      userName: getDisplayName(admin),
      action: "users_merged",
      entityType: "user",
      entityId: args.primaryUserId,
      details: `Merged ${secondaryLabel} into ${primaryLabel}`,
      previousValue: args.secondaryUserId,
      newValue: args.primaryUserId,
    });

    return {
      success: true,
      mergedUserId: args.primaryUserId,
      referencesReassigned,
    };
  },
});
