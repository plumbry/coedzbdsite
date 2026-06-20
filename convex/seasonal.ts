import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getDisplayName, requireAdmin } from "./auth_helpers";

const DEFAULT_CAMPAIGN_SLUG = "summer-slam";
const DEFAULT_CAMPAIGN_TITLE = "Summer Slam Passport";
const MAX_IMAGES_PER_SUBMISSION = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const VIDEO_FILE_EXTENSIONS = /\.(mp4|mov|avi|webm|mkv|m4v|wmv|flv|mpeg|mpg|3gp)$/i;

const teamFormatValidator = v.union(
  v.literal("duos"),
  v.literal("trios"),
  v.literal("squads"),
);

const categoryValidator = v.union(
  v.literal("traveller"),
  v.literal("competitor"),
  v.literal("summer_spirit"),
  v.literal("team_player"),
  v.literal("community"),
);

const completionMethodValidator = v.union(
  v.literal("auto"),
  v.literal("manual"),
  v.literal("admin"),
);

const evidenceInputValidator = v.union(v.literal("image"), v.literal("link"));

const statusValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("needs_more_evidence"),
);

const submissionStatusValidator = v.union(
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("needs_more_evidence"),
);

const evidenceTypeValidator = v.union(
  v.literal("image"),
  v.literal("screenshot_link"),
  v.literal("clip_link"),
  v.literal("yunite_link"),
  v.literal("discord_link"),
  v.literal("social_link"),
  v.literal("other"),
  v.literal("notes"),
);

const passportAvatarIdValidator = v.union(
  v.literal("sunset"),
  v.literal("surfboard"),
  v.literal("ice_cream"),
  v.literal("tropical_drink"),
  v.literal("beach_chair"),
  v.literal("sand_bucket"),
  v.literal("conch_shell"),
  v.literal("starfish"),
  v.literal("clownfish"),
);

const qualificationRuleValidator = v.union(
  v.object({
    type: v.literal("play_events"),
    count: v.number(),
  }),
  v.object({
    type: v.literal("play_team_format"),
    teamFormat: teamFormatValidator,
  }),
  v.object({
    type: v.literal("play_all_team_formats"),
  }),
  v.object({
    type: v.literal("reach_top"),
    placement: v.number(),
    teamFormat: v.optional(teamFormatValidator),
    eventCount: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("win_game"),
    teamFormat: v.optional(teamFormatValidator),
  }),
);

type TeamFormat = "duos" | "trios" | "squads";
type ProgressStatus =
  | "not_started"
  | "in_progress"
  | "pending_review"
  | "approved"
  | "rejected"
  | "needs_more_evidence";
type QualificationRule = Doc<"seasonalQuests">["qualificationRule"];

function normalizeSlug(slug: string | undefined): string {
  return (slug || DEFAULT_CAMPAIGN_SLUG).trim().toLowerCase();
}

function sanitizeText(value: string | undefined, maxLength: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/[<>]/g, "").slice(0, maxLength);
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ConvexError({ message: `${field} must be a positive whole number`, code: "BAD_REQUEST" });
  }
  return value;
}

function validateHttpUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("bad protocol");
    }
    return trimmed.slice(0, 500);
  } catch {
    throw new ConvexError({ message: "Evidence links must be valid http(s) URLs", code: "BAD_REQUEST" });
  }
}

function isVideoUpload(contentType: string, fileName: string): boolean {
  return contentType.toLowerCase().startsWith("video/") || VIDEO_FILE_EXTENSIONS.test(fileName);
}

async function getCampaignBySlug(ctx: QueryCtx | MutationCtx, slug: string) {
  return await ctx.db
    .query("seasonalCampaigns")
    .withIndex("by_slug", (q) => q.eq("slug", normalizeSlug(slug)))
    .first();
}

async function requireCampaign(ctx: QueryCtx | MutationCtx, slug: string) {
  const campaign = await getCampaignBySlug(ctx, slug);
  if (!campaign) {
    throw new ConvexError({ message: "Campaign not found", code: "NOT_FOUND" });
  }
  return campaign;
}

async function resolveCurrentPlayer(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { user: null, player: null, discordUserId: null };

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .first();
  const discordUserId = user?.discordUserId ?? null;
  if (!discordUserId) return { user, player: null, discordUserId: null };

  const player = await ctx.db
    .query("players")
    .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordUserId))
    .first();
  return { user, player, discordUserId };
}

async function requireCurrentPassport(
  ctx: MutationCtx,
  campaign: Doc<"seasonalCampaigns">,
) {
  const { user, player, discordUserId } = await resolveCurrentPlayer(ctx);
  if (!user) {
    throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  }
  if (!discordUserId || !player) {
    throw new ConvexError({
      message:
        "We couldn’t find a ZBD player profile linked to your Discord account. Please make sure you’ve played/registered with this Discord account or contact staff.",
      code: "PLAYER_NOT_LINKED",
    });
  }

  const existing = await ctx.db
    .query("seasonalPassports")
    .withIndex("by_campaign_and_player", (q) =>
      q.eq("campaignId", campaign._id).eq("playerId", player._id),
    )
    .first();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { lastViewedAt: now });
    return { user, player, passportId: existing._id };
  }

  const passportId = await ctx.db.insert("seasonalPassports", {
    campaignId: campaign._id,
    playerId: player._id,
    userId: user._id,
    createdAt: now,
    lastViewedAt: now,
  });
  await logSeasonalAudit(ctx, {
    campaignId: campaign._id,
    playerId: player._id,
    action: "passport_created",
    note: player.discordUsername,
  });
  return { user, player, passportId };
}

async function logSeasonalAudit(
  ctx: MutationCtx,
  params: {
    campaignId: Id<"seasonalCampaigns">;
    questId?: Id<"seasonalQuests">;
    submissionId?: Id<"seasonalQuestSubmissions">;
    playerId?: Id<"players">;
    adminId?: Id<"users">;
    action: string;
    note?: string;
  },
) {
  await ctx.db.insert("seasonalQuestAuditLogs", {
    ...params,
    note: sanitizeText(params.note, 1000),
    createdAt: Date.now(),
  });
}

async function getOrInsertProgress(
  ctx: MutationCtx,
  args: {
    campaignId: Id<"seasonalCampaigns">;
    quest: Doc<"seasonalQuests">;
    playerId: Id<"players">;
  },
) {
  const existing = await ctx.db
    .query("seasonalQuestProgress")
    .withIndex("by_quest_and_player", (q) =>
      q.eq("questId", args.quest._id).eq("playerId", args.playerId),
    )
    .first();
  if (existing) return existing;

  const now = Date.now();
  const progressId = await ctx.db.insert("seasonalQuestProgress", {
    campaignId: args.campaignId,
    questId: args.quest._id,
    playerId: args.playerId,
    status: "not_started",
    stampReward: args.quest.stampReward,
    updatedAt: now,
  });
  return await ctx.db.get(progressId);
}

async function setProgress(
  ctx: MutationCtx,
  args: {
    campaignId: Id<"seasonalCampaigns">;
    quest: Doc<"seasonalQuests">;
    playerId: Id<"players">;
    status: ProgressStatus;
    progressCurrent?: number;
    progressTarget?: number;
    awardSource?: "auto" | "manual_review" | "admin";
    awardLog?: string;
    submissionId?: Id<"seasonalQuestSubmissions">;
  },
) {
  const now = Date.now();
  const existing = await getOrInsertProgress(ctx, args);
  if (!existing) return;
  if (existing.status === "approved" && !args.quest.repeatable) {
    return;
  }

  await ctx.db.patch(existing._id, {
    status: args.status,
    progressCurrent: args.progressCurrent,
    progressTarget: args.progressTarget,
    stampReward: args.quest.stampReward,
    awardSource: args.awardSource,
    awardLog: sanitizeText(args.awardLog, 1000),
    submissionId: args.submissionId,
    approvedAt: args.status === "approved" ? now : existing.approvedAt,
    updatedAt: now,
  });
}

async function loadCampaignEventContext(ctx: QueryCtx | MutationCtx, campaignId: Id<"seasonalCampaigns">) {
  const tags = await ctx.db
    .query("seasonalCampaignEvents")
    .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
    .collect();
  const eventById = new Map<Id<"events">, Doc<"events">>();
  const teamFormatByEvent = new Map<Id<"events">, TeamFormat>();
  for (const tag of tags) {
    const event = await ctx.db.get(tag.eventId);
    if (event) {
      eventById.set(tag.eventId, event);
      teamFormatByEvent.set(tag.eventId, tag.teamFormat);
    }
  }
  return { tags, eventById, teamFormatByEvent };
}

async function loadPlayerCampaignResults(
  ctx: QueryCtx | MutationCtx,
  campaignId: Id<"seasonalCampaigns">,
  playerId: Id<"players">,
) {
  const { tags, eventById, teamFormatByEvent } = await loadCampaignEventContext(ctx, campaignId);
  const results: Array<Doc<"thirdPartyResults"> & { eventId: Id<"events">; teamFormat: TeamFormat; event: Doc<"events"> }> = [];
  const importIds = new Set<Id<"thirdPartyImports">>();

  for (const tag of tags) {
    const event = eventById.get(tag.eventId);
    if (!event) continue;
    const imports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", tag.eventId))
      .collect();
    for (const importRecord of imports) {
      importIds.add(importRecord._id);
      const importResults = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", importRecord._id))
        .collect();
      for (const result of importResults) {
        if (result.playerId === playerId) {
          results.push({ ...result, eventId: tag.eventId, teamFormat: tag.teamFormat, event });
        }
      }
    }
  }

  const playerMatchStats = await ctx.db
    .query("matchPlayerStats")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  const matchStats = playerMatchStats.filter((stat) => importIds.has(stat.importId));
  return { results, matchStats, teamFormatByEvent };
}

function formatEventDate(event: Doc<"events">): string {
  const parsed = new Date(event.startDate);
  if (Number.isNaN(parsed.getTime())) return event.startDate;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

function evaluateRule(
  rule: QualificationRule,
  data: Awaited<ReturnType<typeof loadPlayerCampaignResults>>,
) {
  if (!rule) {
    return { qualifies: false, current: 0, target: 1, log: undefined };
  }

  const eventIds = new Set(data.results.map((result) => result.eventId));
  if (rule.type === "play_events") {
    const target = requirePositiveInteger(rule.count, "Event count");
    return {
      qualifies: eventIds.size >= target,
      current: eventIds.size,
      target,
      log: eventIds.size >= target ? `Auto-approved: Played ${target} campaign event${target === 1 ? "" : "s"}.` : undefined,
    };
  }

  if (rule.type === "play_team_format") {
    const played = data.results.find((result) => result.teamFormat === rule.teamFormat);
    return {
      qualifies: !!played,
      current: played ? 1 : 0,
      target: 1,
      log: played
        ? `Auto-approved: Played a campaign ${rule.teamFormat} event on ${formatEventDate(played.event)}.`
        : undefined,
    };
  }

  if (rule.type === "play_all_team_formats") {
    const formats = new Set(data.results.map((result) => result.teamFormat));
    return {
      qualifies: formats.has("duos") && formats.has("trios") && formats.has("squads"),
      current: formats.size,
      target: 3,
      log: formats.size >= 3 ? "Auto-approved: Played Duos, Trios and Squads during the campaign." : undefined,
    };
  }

  if (rule.type === "reach_top") {
    const targetPlacement = requirePositiveInteger(rule.placement, "Placement");
    const neededEvents = requirePositiveInteger(rule.eventCount ?? 1, "Event count");
    const matches = data.results.filter(
      (result) =>
        result.placement <= targetPlacement &&
        (!rule.teamFormat || result.teamFormat === rule.teamFormat),
    );
    const uniqueEvents = new Map<Id<"events">, (typeof matches)[number]>();
    for (const match of matches) uniqueEvents.set(match.eventId, match);
    const firstMatch = matches[0];
    return {
      qualifies: uniqueEvents.size >= neededEvents,
      current: uniqueEvents.size,
      target: neededEvents,
      log:
        uniqueEvents.size >= neededEvents && firstMatch
          ? `Auto-approved: Reached Top ${targetPlacement} in ${firstMatch.teamFormat} on ${formatEventDate(firstMatch.event)}.`
          : undefined,
    };
  }

  if (rule.type === "win_game") {
    const leaderboardWin = data.results.find(
      (result) =>
        (!rule.teamFormat || result.teamFormat === rule.teamFormat) &&
        ((result.wins ?? 0) > 0 || result.placement === 1),
    );
    const matchWin = data.matchStats.find((stat) => stat.placement === 1);
    const qualifies = !!leaderboardWin || !!matchWin;
    return {
      qualifies,
      current: qualifies ? 1 : 0,
      target: 1,
      log: leaderboardWin
        ? `Auto-approved: Won a campaign game in ${leaderboardWin.teamFormat} on ${formatEventDate(leaderboardWin.event)}.`
        : qualifies
          ? "Auto-approved: Won a campaign game from match data."
          : undefined,
    };
  }

  return { qualifies: false, current: 0, target: 1, log: undefined };
}

export const ensureSummerSlamCampaign = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const existing = await getCampaignBySlug(ctx, DEFAULT_CAMPAIGN_SLUG);
    if (existing) return existing._id;

    const campaignId = await ctx.db.insert("seasonalCampaigns", {
      slug: DEFAULT_CAMPAIGN_SLUG,
      title: DEFAULT_CAMPAIGN_TITLE,
      description: "Configurable seasonal quest campaign.",
      isActive: true,
      stampName: "Passport Stamp",
      littleWheelEntryEveryStamps: 1,
      bigWheelEntryEveryStamps: 5,
      createdBy: admin._id,
      updatedAt: Date.now(),
    });
    await logSeasonalAudit(ctx, {
      campaignId,
      adminId: admin._id,
      action: "campaign_created",
      note: DEFAULT_CAMPAIGN_TITLE,
    });
    return campaignId;
  },
});

export const getCampaign = query({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await getCampaignBySlug(ctx, normalizeSlug(args.slug));
  },
});

export const updateCampaign = mutation({
  args: {
    slug: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    stampName: v.string(),
    littleWheelEntryEveryStamps: v.number(),
    bigWheelEntryEveryStamps: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const title = sanitizeText(args.title, 120);
    const stampName = sanitizeText(args.stampName, 80);
    if (!title || !stampName) {
      throw new ConvexError({ message: "Campaign title and stamp name are required", code: "BAD_REQUEST" });
    }

    await ctx.db.patch(campaign._id, {
      title,
      description: sanitizeText(args.description, 2000),
      isActive: args.isActive,
      stampName,
      littleWheelEntryEveryStamps: requirePositiveInteger(
        args.littleWheelEntryEveryStamps,
        "Little wheel stamp interval",
      ),
      bigWheelEntryEveryStamps: requirePositiveInteger(
        args.bigWheelEntryEveryStamps,
        "Big wheel stamp interval",
      ),
      updatedBy: admin._id,
      updatedAt: Date.now(),
    });

    await logSeasonalAudit(ctx, {
      campaignId: campaign._id,
      adminId: admin._id,
      action: args.isActive ? "campaign_updated" : "campaign_archived",
      note: title,
    });
    return { success: true };
  },
});

export const ensureMyPassport = mutation({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    if (!campaign.isActive) {
      throw new ConvexError({ message: "Campaign is not active", code: "CAMPAIGN_INACTIVE" });
    }
    const { player, passportId } = await requireCurrentPassport(ctx, campaign);
    return {
      passportId,
      player: {
        _id: player._id,
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
      },
    };
  },
});

export const setPassportAvatar = mutation({
  args: {
    slug: v.optional(v.string()),
    avatarId: passportAvatarIdValidator,
  },
  handler: async (ctx, args) => {
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    if (!campaign.isActive) {
      throw new ConvexError({ message: "Campaign is not active", code: "CAMPAIGN_INACTIVE" });
    }
    const { passportId } = await requireCurrentPassport(ctx, campaign);
    await ctx.db.patch(passportId, { avatarId: args.avatarId });
    return { avatarId: args.avatarId };
  },
});

export const getEventTags = query({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const campaign = await getCampaignBySlug(ctx, normalizeSlug(args.slug));
    if (!campaign) return [];
    return await ctx.db
      .query("seasonalCampaignEvents")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
  },
});

export const setCampaignEvent = mutation({
  args: {
    slug: v.optional(v.string()),
    eventId: v.id("events"),
    enabled: v.boolean(),
    teamFormat: teamFormatValidator,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }

    const existing = await ctx.db
      .query("seasonalCampaignEvents")
      .withIndex("by_campaign_and_event", (q) =>
        q.eq("campaignId", campaign._id).eq("eventId", args.eventId),
      )
      .first();

    if (!args.enabled) {
      if (existing) {
        await ctx.db.delete(existing._id);
        await logSeasonalAudit(ctx, {
          campaignId: campaign._id,
          adminId: admin._id,
          action: "event_unmarked",
          note: event.name,
        });
      }
      await ctx.scheduler.runAfter(0, internal.seasonal.recalculateCampaignInternal, {
        campaignId: campaign._id,
        cursor: null,
      });
      return { success: true };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        teamFormat: args.teamFormat,
        updatedBy: admin._id,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("seasonalCampaignEvents", {
        campaignId: campaign._id,
        eventId: args.eventId,
        teamFormat: args.teamFormat,
        createdBy: admin._id,
        updatedAt: Date.now(),
      });
    }

    await logSeasonalAudit(ctx, {
      campaignId: campaign._id,
      adminId: admin._id,
      action: "event_marked",
      note: `${event.name} (${args.teamFormat})`,
    });
    await ctx.scheduler.runAfter(0, internal.seasonal.recalculateCampaignInternal, {
      campaignId: campaign._id,
      cursor: null,
    });
    return { success: true };
  },
});

export const listQuests = query({
  args: { slug: v.optional(v.string()), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const quests = await ctx.db
      .query("seasonalQuests")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    return quests
      .filter((quest) => args.includeInactive || quest.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  },
});

export const saveQuest = mutation({
  args: {
    slug: v.optional(v.string()),
    questId: v.optional(v.id("seasonalQuests")),
    title: v.string(),
    category: categoryValidator,
    description: v.string(),
    evidenceInstructions: v.optional(v.string()),
    adminHint: v.optional(v.string()),
    sortOrder: v.number(),
    isActive: v.boolean(),
    completionMethod: completionMethodValidator,
    evidenceInput: v.optional(evidenceInputValidator),
    qualificationRule: v.optional(qualificationRuleValidator),
    stampReward: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const completionMethod = args.completionMethod;
    if (completionMethod === "auto" && !args.qualificationRule) {
      throw new ConvexError({ message: "Auto quests require a qualification rule", code: "BAD_REQUEST" });
    }
    if (completionMethod !== "auto" && args.qualificationRule) {
      throw new ConvexError({ message: "Only auto quests can have qualification rules", code: "BAD_REQUEST" });
    }
    if (completionMethod === "manual" && !args.evidenceInput) {
      throw new ConvexError({
        message: "Submit quests require an evidence type (image or link)",
        code: "BAD_REQUEST",
      });
    }
    if (completionMethod !== "manual" && args.evidenceInput) {
      throw new ConvexError({
        message: "Evidence type is only allowed for submit quests",
        code: "BAD_REQUEST",
      });
    }

    const patch = {
      campaignId: campaign._id,
      title: sanitizeText(args.title, 120) ?? "",
      category: args.category,
      description: sanitizeText(args.description, 2000) ?? "",
      evidenceInstructions: sanitizeText(args.evidenceInstructions, 2000),
      adminHint: sanitizeText(args.adminHint, 2000),
      sortOrder: args.sortOrder,
      isActive: args.isActive,
      repeatable: false,
      stampReward: requirePositiveInteger(args.stampReward ?? 1, "Stamp reward"),
      completionMethod,
      evidenceInput: completionMethod === "manual" ? args.evidenceInput : undefined,
      qualificationRule: args.qualificationRule,
      updatedBy: admin._id,
      updatedAt: Date.now(),
    };

    if (!patch.title || !patch.description) {
      throw new ConvexError({ message: "Title and description are required", code: "BAD_REQUEST" });
    }

    let questId = args.questId;
    if (questId) {
      const existing = await ctx.db.get(questId);
      if (!existing || existing.campaignId !== campaign._id) {
        throw new ConvexError({ message: "Quest not found", code: "NOT_FOUND" });
      }
      await ctx.db.patch(questId, patch);
    } else {
      questId = await ctx.db.insert("seasonalQuests", {
        ...patch,
        createdBy: admin._id,
      });
    }

    await logSeasonalAudit(ctx, {
      campaignId: campaign._id,
      questId,
      adminId: admin._id,
      action: args.questId ? "quest_updated" : "quest_created",
      note: patch.title,
    });

    if (completionMethod === "auto") {
      await ctx.scheduler.runAfter(0, internal.seasonal.recalculateCampaignInternal, {
        campaignId: campaign._id,
        cursor: null,
      });
    }
    return questId;
  },
});

export const deleteQuest = mutation({
  args: {
    slug: v.optional(v.string()),
    questId: v.id("seasonalQuests"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));

    const quest = await ctx.db.get(args.questId);
    if (!quest || quest.campaignId !== campaign._id) {
      throw new ConvexError({ message: "Quest not found", code: "NOT_FOUND" });
    }

    // Remove every player's progress for this quest.
    const progressRows = await ctx.db
      .query("seasonalQuestProgress")
      .withIndex("by_quest_and_player", (q) => q.eq("questId", args.questId))
      .collect();
    for (const row of progressRows) {
      await ctx.db.delete(row._id);
    }

    // Remove submissions plus their uploaded evidence images and stored files.
    const submissions = await ctx.db
      .query("seasonalQuestSubmissions")
      .withIndex("by_quest", (q) => q.eq("questId", args.questId))
      .collect();
    for (const submission of submissions) {
      const images = await ctx.db
        .query("seasonalSubmissionImages")
        .withIndex("by_submission", (q) => q.eq("submissionId", submission._id))
        .collect();
      for (const image of images) {
        await ctx.storage.delete(image.storageId);
        await ctx.db.delete(image._id);
      }
      await ctx.db.delete(submission._id);
    }

    await ctx.db.delete(args.questId);

    await logSeasonalAudit(ctx, {
      campaignId: campaign._id,
      adminId: admin._id,
      action: "quest_deleted",
      note: quest.title,
    });

    // Wheel totals and passport aggregates depend on this quest, so refresh.
    await ctx.scheduler.runAfter(0, internal.seasonal.recalculateCampaignInternal, {
      campaignId: campaign._id,
      cursor: null,
    });

    return { deleted: true };
  },
});

export const generateEvidenceUploadUrl = mutation({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    if (!campaign.isActive) {
      throw new ConvexError({ message: "Campaign is not active", code: "CAMPAIGN_INACTIVE" });
    }
    await requireCurrentPassport(ctx, campaign);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getPassport = query({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const campaign = await getCampaignBySlug(ctx, normalizeSlug(args.slug));
    if (!campaign) return { campaign: null, player: null, quests: [], totals: null };

    const { player } = await resolveCurrentPlayer(ctx);
    const passport = player
      ? await ctx.db
        .query("seasonalPassports")
        .withIndex("by_campaign_and_player", (q) =>
          q.eq("campaignId", campaign._id).eq("playerId", player._id),
        )
        .first()
      : null;
    const quests = await ctx.db
      .query("seasonalQuests")
      .withIndex("by_campaign_and_active", (q) =>
        q.eq("campaignId", campaign._id).eq("isActive", true),
      )
      .collect();

    if (!player) {
      return {
        campaign,
        player: null,
        passport: null,
        quests: quests
          .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
          .map((quest) => ({
            quest,
            progress: null,
          })),
        totals: null,
      };
    }

    const progressRows = await ctx.db
      .query("seasonalQuestProgress")
      .withIndex("by_campaign_and_player", (q) =>
        q.eq("campaignId", campaign._id).eq("playerId", player._id),
      )
      .collect();
    const progressByQuest = new Map(progressRows.map((row) => [row.questId, row]));
    const approvedStamps = progressRows
      .filter((row) => row.status === "approved")
      .reduce((total, row) => total + row.stampReward, 0);

    return {
      campaign,
      player: {
        _id: player._id,
        discordUsername: player.discordUsername,
        epicUsername: player.epicUsername,
      },
      passport,
      quests: quests
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
        .map((quest) => ({
          quest,
          progress: progressByQuest.get(quest._id) ?? null,
        })),
      totals: {
        approvedStamps,
        littleWheelEntries: Math.floor(approvedStamps / campaign.littleWheelEntryEveryStamps),
        bigWheelEntries: Math.floor(approvedStamps / campaign.bigWheelEntryEveryStamps),
      },
    };
  },
});

export const submitEvidence = mutation({
  args: {
    slug: v.optional(v.string()),
    questId: v.id("seasonalQuests"),
    evidenceTypes: v.array(evidenceTypeValidator),
    evidenceUrls: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    images: v.optional(v.array(v.object({
      storageId: v.id("_storage"),
      fileName: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    if (!campaign.isActive) {
      throw new ConvexError({ message: "Campaign is not active", code: "CAMPAIGN_INACTIVE" });
    }
    const { player } = await requireCurrentPassport(ctx, campaign);
    const quest = await ctx.db.get(args.questId);
    if (!quest || quest.campaignId !== campaign._id || !quest.isActive || quest.completionMethod !== "manual") {
      throw new ConvexError({ message: "Manual quest not found", code: "NOT_FOUND" });
    }

    const existingProgress = await ctx.db
      .query("seasonalQuestProgress")
      .withIndex("by_quest_and_player", (q) => q.eq("questId", quest._id).eq("playerId", player._id))
      .first();
    if (existingProgress?.status === "approved" && !quest.repeatable) {
      throw new ConvexError({ message: "This quest has already been approved", code: "CONFLICT" });
    }
    if (existingProgress?.status === "pending_review") {
      throw new ConvexError({ message: "This quest already has a pending submission", code: "CONFLICT" });
    }

    const images = args.images ?? [];
    if (images.length > MAX_IMAGES_PER_SUBMISSION) {
      throw new ConvexError({ message: "Maximum 3 images per submission", code: "BAD_REQUEST" });
    }
    if (quest.evidenceInput === "image" && images.length === 0) {
      throw new ConvexError({ message: "This quest requires an image upload", code: "BAD_REQUEST" });
    }
    if (quest.evidenceInput === "link" && images.length > 0) {
      throw new ConvexError({ message: "This quest requires a link, not an image upload", code: "BAD_REQUEST" });
    }

    const evidenceUrls = (args.evidenceUrls ?? []).map(validateHttpUrl);
    const notes = sanitizeText(args.notes, 2000);
    if (quest.evidenceInput === "link" && evidenceUrls.length === 0) {
      throw new ConvexError({ message: "This quest requires an evidence link", code: "BAD_REQUEST" });
    }
    if (images.length === 0 && evidenceUrls.length === 0 && !notes) {
      throw new ConvexError({ message: "Add at least one image, link, or note", code: "BAD_REQUEST" });
    }

    const imageMetadata: Array<{ storageId: Id<"_storage">; fileName: string; contentType: string; size: number }> = [];
    for (const image of images) {
      const metadata = await ctx.db.system.get("_storage", image.storageId);
      if (!metadata) {
        throw new ConvexError({ message: "Uploaded image not found", code: "BAD_REQUEST" });
      }
      const contentType = metadata.contentType ?? "";
      const fileName = sanitizeText(image.fileName, 200) ?? "evidence";
      if (isVideoUpload(contentType, fileName)) {
        throw new ConvexError({
          message: "Video files are not supported. Submit video evidence as a link instead.",
          code: "BAD_REQUEST",
        });
      }
      if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
        throw new ConvexError({ message: "Images must be jpg, jpeg, png, or webp", code: "BAD_REQUEST" });
      }
      if (metadata.size > MAX_IMAGE_BYTES) {
        throw new ConvexError({ message: "Images must be 5MB or smaller", code: "BAD_REQUEST" });
      }
      imageMetadata.push({
        storageId: image.storageId,
        fileName,
        contentType,
        size: metadata.size,
      });
    }

    const evidenceTypes = new Set(args.evidenceTypes);
    if (images.length > 0) evidenceTypes.add("image");
    if (notes) evidenceTypes.add("notes");

    const submissionId = await ctx.db.insert("seasonalQuestSubmissions", {
      campaignId: campaign._id,
      questId: quest._id,
      playerId: player._id,
      status: "pending_review",
      evidenceTypes: [...evidenceTypes],
      evidenceUrls,
      notes,
      submittedAt: Date.now(),
    });

    for (const image of imageMetadata) {
      await ctx.db.insert("seasonalSubmissionImages", {
        submissionId,
        storageId: image.storageId,
        fileName: image.fileName,
        contentType: image.contentType,
        size: image.size,
        uploadedByPlayerId: player._id,
      });
    }

    await setProgress(ctx, {
      campaignId: campaign._id,
      quest,
      playerId: player._id,
      status: "pending_review",
      progressCurrent: 1,
      progressTarget: 1,
      submissionId,
    });
    await logSeasonalAudit(ctx, {
      campaignId: campaign._id,
      questId: quest._id,
      submissionId,
      playerId: player._id,
      action: "submission_created",
    });
    return submissionId;
  },
});

export const getAdminDashboard = query({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const quests = await ctx.db
      .query("seasonalQuests")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    const submissions = await ctx.db
      .query("seasonalQuestSubmissions")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    const progress = await ctx.db
      .query("seasonalQuestProgress")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    const tags = await ctx.db
      .query("seasonalCampaignEvents")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();

    return {
      campaign,
      quests: quests.sort((a, b) => a.sortOrder - b.sortOrder),
      counts: {
        taggedEvents: tags.length,
        activeQuests: quests.filter((quest) => quest.isActive).length,
        pendingSubmissions: submissions.filter((submission) => submission.status === "pending_review").length,
        approvedStamps: progress
          .filter((row) => row.status === "approved")
          .reduce((total, row) => total + row.stampReward, 0),
      },
    };
  },
});

export const getReviewQueue = query({
  args: { slug: v.optional(v.string()), status: v.optional(submissionStatusValidator) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const submissions = await ctx.db
      .query("seasonalQuestSubmissions")
      .withIndex(
        args.status ? "by_campaign_and_status" : "by_campaign",
        (q) => args.status
          ? q.eq("campaignId", campaign._id).eq("status", args.status)
          : q.eq("campaignId", campaign._id),
      )
      .collect();

    const rows = [];
    for (const submission of submissions) {
      const [quest, player, images] = await Promise.all([
        ctx.db.get(submission.questId),
        ctx.db.get(submission.playerId),
        ctx.db
          .query("seasonalSubmissionImages")
          .withIndex("by_submission", (q) => q.eq("submissionId", submission._id))
          .collect(),
      ]);
      const imageUrls = [];
      for (const image of images) {
        imageUrls.push({
          ...image,
          url: await ctx.storage.getUrl(image.storageId),
        });
      }
      rows.push({ submission, quest, player, images: imageUrls });
    }

    return rows.sort((a, b) => b.submission.submittedAt - a.submission.submittedAt);
  },
});

export const getAdminPassports = query({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const passports = await ctx.db
      .query("seasonalPassports")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    const rows = [];
    for (const passport of passports) {
      const player = await ctx.db.get(passport.playerId);
      const user = await ctx.db.get(passport.userId);
      const progressRows = await ctx.db
        .query("seasonalQuestProgress")
        .withIndex("by_campaign_and_player", (q) =>
          q.eq("campaignId", campaign._id).eq("playerId", passport.playerId),
        )
        .collect();
      const approvedStamps = progressRows
        .filter((row) => row.status === "approved")
        .reduce((total, row) => total + row.stampReward, 0);
      rows.push({
        passport,
        player,
        user,
        approvedStamps,
        littleWheelEntries: Math.floor(approvedStamps / campaign.littleWheelEntryEveryStamps),
        bigWheelEntries: Math.floor(approvedStamps / campaign.bigWheelEntryEveryStamps),
        completedQuests: progressRows.filter((row) => row.status === "approved").length,
      });
    }
    return rows.sort((a, b) => b.passport.createdAt - a.passport.createdAt);
  },
});

export const reviewSubmission = mutation({
  args: {
    submissionId: v.id("seasonalQuestSubmissions"),
    status: submissionStatusValidator,
    reviewNote: v.optional(v.string()),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) {
      throw new ConvexError({ message: "Submission not found", code: "NOT_FOUND" });
    }
    if (submission.status !== "pending_review") {
      throw new ConvexError({ message: "Submission has already been reviewed", code: "CONFLICT" });
    }
    const quest = await ctx.db.get(submission.questId);
    if (!quest) {
      throw new ConvexError({ message: "Quest not found", code: "NOT_FOUND" });
    }
    const { player: reviewerPlayer } = await resolveCurrentPlayer(ctx);
    if (reviewerPlayer?._id === submission.playerId) {
      throw new ConvexError({ message: "Admins cannot review their own submissions", code: "FORBIDDEN" });
    }

    const status = args.status;
    const staffFeedback = sanitizeText(args.rejectionReason ?? args.reviewNote, 1000);
    let progressAwardLog: string | undefined;
    if (status === "approved") {
      progressAwardLog = `Approved by ${getDisplayName(admin)}.`;
    } else if (staffFeedback) {
      progressAwardLog = staffFeedback;
    } else if (status === "needs_more_evidence") {
      progressAwardLog =
        "Staff need more evidence before this stamp can be approved. Read the quest instructions and resubmit.";
    } else if (status === "rejected") {
      progressAwardLog = "This submission was not approved. Submit new evidence if you believe it meets the requirements.";
    }

    await ctx.db.patch(submission._id, {
      status,
      reviewedBy: admin._id,
      reviewedAt: Date.now(),
      reviewNote: sanitizeText(args.reviewNote, 1000),
      rejectionReason: sanitizeText(args.rejectionReason ?? args.reviewNote, 1000),
    });

    await setProgress(ctx, {
      campaignId: submission.campaignId,
      quest,
      playerId: submission.playerId,
      status,
      progressCurrent: status === "approved" ? 1 : undefined,
      progressTarget: 1,
      awardSource: status === "approved" ? "manual_review" : undefined,
      awardLog: progressAwardLog,
      submissionId: submission._id,
    });

    await logSeasonalAudit(ctx, {
      campaignId: submission.campaignId,
      questId: submission.questId,
      submissionId: submission._id,
      playerId: submission.playerId,
      adminId: admin._id,
      action: `submission_${status}`,
      note: args.reviewNote ?? args.rejectionReason,
    });
    return { success: true };
  },
});

export const awardQuestManually = mutation({
  args: {
    slug: v.optional(v.string()),
    questId: v.id("seasonalQuests"),
    playerId: v.id("players"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const quest = await ctx.db.get(args.questId);
    if (!quest || quest.campaignId !== campaign._id) {
      throw new ConvexError({ message: "Quest not found", code: "NOT_FOUND" });
    }
    await setProgress(ctx, {
      campaignId: campaign._id,
      quest,
      playerId: args.playerId,
      status: "approved",
      progressCurrent: 1,
      progressTarget: 1,
      awardSource: "admin",
      awardLog: sanitizeText(args.note, 1000) ?? `Approved by ${getDisplayName(admin)}.`,
    });
    await logSeasonalAudit(ctx, {
      campaignId: campaign._id,
      questId: quest._id,
      playerId: args.playerId,
      adminId: admin._id,
      action: "quest_admin_awarded",
      note: args.note,
    });
    return { success: true };
  },
});

export const recalculateCampaign = mutation({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    await logSeasonalAudit(ctx, {
      campaignId: campaign._id,
      adminId: admin._id,
      action: "recalculate_requested",
    });
    await ctx.scheduler.runAfter(0, internal.seasonal.recalculateCampaignInternal, {
      campaignId: campaign._id,
      cursor: null,
    });
    return { success: true };
  },
});

export const recalculateCampaignInternal = internalMutation({
  args: {
    campaignId: v.id("seasonalCampaigns"),
    cursor: v.union(v.string(), v.null()),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) return;
    const autoQuests = (await ctx.db
      .query("seasonalQuests")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect()).filter((quest) => quest.isActive && quest.completionMethod === "auto");
    if (autoQuests.length === 0) return;

    const page = await ctx.db.query("players").paginate({
      numItems: 40,
      cursor: args.cursor,
    });

    for (const player of page.page) {
      const data = await loadPlayerCampaignResults(ctx, args.campaignId, player._id);
      for (const quest of autoQuests) {
        const evaluation = evaluateRule(quest.qualificationRule, data);
        await setProgress(ctx, {
          campaignId: args.campaignId,
          quest,
          playerId: player._id,
          status: evaluation.qualifies ? "approved" : evaluation.current > 0 ? "in_progress" : "not_started",
          progressCurrent: evaluation.current,
          progressTarget: evaluation.target,
          awardSource: evaluation.qualifies ? "auto" : undefined,
          awardLog: evaluation.log,
        });
        if (evaluation.qualifies && evaluation.log) {
          await logSeasonalAudit(ctx, {
            campaignId: args.campaignId,
            questId: quest._id,
            playerId: player._id,
            action: "quest_auto_approved",
            note: evaluation.log,
          });
        }
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.seasonal.recalculateCampaignInternal, {
        campaignId: args.campaignId,
        cursor: page.continueCursor,
      });
    }
  },
});

export const recalculatePlayerForImport = internalMutation({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord?.eventId) return;
    const tags = await ctx.db
      .query("seasonalCampaignEvents")
      .withIndex("by_event", (q) => q.eq("eventId", importRecord.eventId!))
      .collect();
    for (const tag of tags) {
      await ctx.scheduler.runAfter(0, internal.seasonal.recalculateCampaignInternal, {
        campaignId: tag.campaignId,
        cursor: null,
      });
    }
  },
});

export const getProgressExport = query({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const progressRows = await ctx.db
      .query("seasonalQuestProgress")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    const submissions = await ctx.db
      .query("seasonalQuestSubmissions")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();

    const rows = [];
    const byPlayer = new Map<Id<"players">, Doc<"seasonalQuestProgress">[]>();
    for (const row of progressRows) {
      const existing = byPlayer.get(row.playerId) ?? [];
      existing.push(row);
      byPlayer.set(row.playerId, existing);
    }

    for (const [playerId, playerProgress] of byPlayer) {
      const player = await ctx.db.get(playerId);
      const approvedStamps = playerProgress
        .filter((row) => row.status === "approved")
        .reduce((total, row) => total + row.stampReward, 0);
      rows.push({
        playerId,
        discordName: player?.discordUsername ?? "",
        epicName: player?.epicUsername ?? "",
        approvedStamps,
        pendingSubmissions: submissions.filter(
          (submission) => submission.playerId === playerId && submission.status === "pending_review",
        ).length,
        rejectedSubmissions: submissions.filter(
          (submission) => submission.playerId === playerId && submission.status === "rejected",
        ).length,
        littleWheelEntries: Math.floor(approvedStamps / campaign.littleWheelEntryEveryStamps),
        bigWheelEntries: Math.floor(approvedStamps / campaign.bigWheelEntryEveryStamps),
        completedQuests: playerProgress.filter((row) => row.status === "approved").length,
      });
    }

    return {
      progress: rows,
      littleWheelEntries: rows.flatMap((row) =>
        Array.from({ length: row.littleWheelEntries }, (_, index) => ({ ...row, entryNumber: index + 1 })),
      ),
      bigWheelEntries: rows.flatMap((row) =>
        Array.from({ length: row.bigWheelEntries }, (_, index) => ({ ...row, entryNumber: index + 1 })),
      ),
      submissions,
      approvedStamps: progressRows.filter((row) => row.status === "approved"),
    };
  },
});
