import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getDisplayName, requireAdmin } from "./auth_helpers";
import {
  buildProfilePatch,
  getDiscordUserIdFromIdentity,
} from "./auth_discord";
import { findPlayerByDiscordUserId } from "./helpers/playerDiscordAliases";
import { provisionViewerUser } from "./userProvisioning";

const DEFAULT_CAMPAIGN_SLUG = "summer-slam";
const DEFAULT_CAMPAIGN_TITLE = "Summer Slam Passport";
const DEFAULT_CAMPAIGN_DESCRIPTION =
  "Complete quests during scrims, submit evidence, earn a place on the prize wheel!";
const LEGACY_CAMPAIGN_DESCRIPTION = "Configurable seasonal quest campaign.";

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
  v.literal("summer_legend"),
);

const completionMethodValidator = v.union(
  v.literal("auto"),
  v.literal("manual"),
  v.literal("admin"),
);

const MAIN_QUEST_CATEGORIES = new Set([
  "traveller",
  "competitor",
  "summer_spirit",
  "team_player",
  "community",
]);

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

const passportBirthplaceIdValidator = v.union(
  v.literal("paradise_palms"),
  v.literal("sunny_steps"),
  v.literal("sweaty_sands"),
  v.literal("coral_castle"),
  v.literal("lazy_lagoon"),
  v.literal("heatwave_harbor"),
  v.literal("sunken_shores"),
  v.literal("rave_cave"),
  v.literal("cluster_coast"),
);

const qualificationRuleValidator = v.union(
  v.object({
    type: v.literal("play_events"),
    count: v.number(),
  }),
  v.object({
    type: v.literal("play_all_team_formats"),
  }),
  v.object({
    type: v.literal("reach_top_5"),
  }),
  v.object({
    type: v.literal("reach_top_3"),
  }),
  v.object({
    type: v.literal("reach_top_10"),
  }),
  v.object({
    type: v.literal("win_game"),
    teamFormat: v.optional(teamFormatValidator),
  }),
  v.object({
    type: v.literal("play_event_type"),
    eventType: v.literal("showdown"),
  }),
  v.object({
    type: v.literal("distinct_teammates"),
    count: v.number(),
  }),
  v.object({
    type: v.literal("new_member_teammate"),
    maxEvents: v.number(),
  }),
  v.object({
    type: v.literal("new_teammates"),
    count: v.number(),
  }),
  // Legacy rules kept so existing quests keep validating.
  v.object({
    type: v.literal("play_team_format"),
    teamFormat: teamFormatValidator,
  }),
  v.object({
    type: v.literal("reach_top"),
    placement: v.number(),
    teamFormat: v.optional(teamFormatValidator),
    eventCount: v.optional(v.number()),
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

function assertPassportAccessible(
  campaign: Doc<"seasonalCampaigns">,
  now = Date.now(),
  options?: { allowAdminEarlyAccess?: boolean },
) {
  if (!campaign.isActive) {
    throw new ConvexError({ message: "Campaign is not active", code: "CAMPAIGN_INACTIVE" });
  }
  if (!options?.allowAdminEarlyAccess && campaign.startsAt && now < campaign.startsAt) {
    throw new ConvexError({ message: "Campaign has not started yet", code: "CAMPAIGN_NOT_STARTED" });
  }
}

function assertSubmissionsOpen(
  campaign: Doc<"seasonalCampaigns">,
  now = Date.now(),
  options?: { allowAdminEarlyAccess?: boolean },
) {
  assertPassportAccessible(campaign, now, {
    allowAdminEarlyAccess: options?.allowAdminEarlyAccess,
  });
  if (campaign.endsAt && now > campaign.endsAt) {
    throw new ConvexError({
      message: "Submissions are closed for this season",
      code: "SUBMISSIONS_CLOSED",
    });
  }
  // Admin early-access preview may submit before season start regardless of the switch.
  const isEarlyAdminPreview =
    Boolean(options?.allowAdminEarlyAccess) &&
    Boolean(campaign.startsAt) &&
    now < campaign.startsAt!;
  if (!isEarlyAdminPreview && campaign.submissionsEnabled === false) {
    throw new ConvexError({
      message: "Evidence submissions are not open yet",
      code: "SUBMISSIONS_DISABLED",
    });
  }
}

/** Admins can test passport flows before the season start date. */
function isAdminCampaignPreview(
  campaign: Doc<"seasonalCampaigns">,
  now = Date.now(),
): boolean {
  return campaign.isActive && !!campaign.startsAt && now < campaign.startsAt;
}

async function resolveCurrentAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .first();
  if (!user || user.role !== "admin") return null;
  return user;
}

async function resolveCurrentPlayer(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { user: null, player: null, discordUserId: null };

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .first();

  const storedDiscordId = user?.discordUserId ?? null;
  const identityDiscordId = getDiscordUserIdFromIdentity(identity);
  const discordCandidates = [...new Set(
    [storedDiscordId, identityDiscordId].filter((id): id is string => Boolean(id)),
  )];

  for (const discordUserId of discordCandidates) {
    const player = await findPlayerByDiscordUserId(ctx, discordUserId);
    if (player) {
      return { user, player, discordUserId };
    }
  }

  return {
    user,
    player: null,
    discordUserId: storedDiscordId ?? identityDiscordId,
  };
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

  // Keep the site user Discord link in sync when JWT / alias resolution found a match.
  if (user.discordUserId !== discordUserId) {
    const owners = await ctx.db
      .query("users")
      .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordUserId))
      .collect();
    const conflict = owners.find((owner) => owner._id !== user._id);
    if (!conflict) {
      await ctx.db.patch(user._id, { discordUserId });
    }
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

type CampaignEventMeta = Pick<Doc<"events">, "_id" | "name" | "startDate"> & {
  type?: Doc<"events">["type"];
};

type CampaignPlayerResult = Doc<"thirdPartyResults"> & {
  importId: Id<"thirdPartyImports">;
  eventId: Id<"events">;
  teamFormat: TeamFormat;
  event: CampaignEventMeta;
  /** Rank on the overall Yunite tournament leaderboard (by points), not an individual game. */
  overallLeaderboardPlacement: number;
};

function eventMetaFromImport(
  importRecord: Doc<"thirdPartyImports">,
  event: Doc<"events"> | null,
): CampaignEventMeta {
  if (event) {
    return { _id: event._id, name: event.name, startDate: event.startDate, type: event.type };
  }
  return {
    _id: (importRecord.eventId ?? importRecord._id) as Id<"events">,
    name: importRecord.eventName,
    startDate: importRecord.eventDate ?? importRecord.tournamentStartedAt?.slice(0, 10) ?? "",
  };
}

/** Group leaderboard rows into teams — never fall back to per-player keys. */
function teamLeaderboardKey(result: Doc<"thirdPartyResults">): string {
  if (result.teamId) return `team:${result.teamId}`;
  if (result.duoAssignment) return `duo:${result.duoAssignment}`;
  if (result.teamName?.trim()) {
    return `teamName:${result.teamName.trim().toLowerCase()}`;
  }
  // Same Yunite standing when team ids/names are missing: shared placement + points.
  return `placement:${result.placement}:points:${result.points}`;
}

/** Overall Yunite standings for one import: unique teams ranked by tournament points. */
function computeOverallLeaderboardRanks(
  importResults: Doc<"thirdPartyResults">[],
): Map<string, number> {
  const teamBest = new Map<string, { points: number; seedPlacement: number }>();
  for (const row of importResults) {
    const key = teamLeaderboardKey(row);
    const existing = teamBest.get(key);
    if (
      !existing ||
      row.points > existing.points ||
      (row.points === existing.points && row.placement < existing.seedPlacement)
    ) {
      teamBest.set(key, { points: row.points, seedPlacement: row.placement });
    }
  }

  const ranked = [...teamBest.entries()].sort((a, b) => {
    if (b[1].points !== a[1].points) return b[1].points - a[1].points;
    return a[1].seedPlacement - b[1].seedPlacement;
  });

  return new Map(ranked.map(([key], index) => [key, index + 1]));
}

type CampaignImportRef = {
  importRecord: Doc<"thirdPartyImports">;
  teamFormat: TeamFormat;
  event: CampaignEventMeta;
};

/** Unique campaign imports from event tags + Summer Slam–flagged imports. */
async function listCampaignImportRefs(
  ctx: QueryCtx | MutationCtx,
  campaignId: Id<"seasonalCampaigns">,
): Promise<{
  campaign: Doc<"seasonalCampaigns"> | null;
  imports: CampaignImportRef[];
  teamFormatByEvent: Map<Id<"events">, TeamFormat>;
}> {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign) {
    return {
      campaign: null,
      imports: [],
      teamFormatByEvent: new Map(),
    };
  }

  const { tags, eventById, teamFormatByEvent } = await loadCampaignEventContext(ctx, campaignId);
  const seen = new Set<Id<"thirdPartyImports">>();
  const imports: CampaignImportRef[] = [];

  for (const tag of tags) {
    const event = eventById.get(tag.eventId);
    if (!event) continue;
    const eventImports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", tag.eventId))
      .collect();
    for (const importRecord of eventImports) {
      if (seen.has(importRecord._id)) continue;
      seen.add(importRecord._id);
      imports.push({
        importRecord,
        teamFormat: tag.teamFormat,
        event: {
          _id: event._id,
          name: event.name,
          startDate: event.startDate,
          type: event.type,
        },
      });
    }
  }

  const taggedImports = await ctx.db
    .query("thirdPartyImports")
    .withIndex("by_seasonal_campaign_slug", (q) => q.eq("seasonalCampaignSlug", campaign.slug))
    .collect();

  for (const importRecord of taggedImports) {
    if (!importRecord.seasonalTeamFormat) continue;
    if (seen.has(importRecord._id)) continue;
    seen.add(importRecord._id);
    const linkedEvent = importRecord.eventId ? await ctx.db.get(importRecord.eventId) : null;
    imports.push({
      importRecord,
      teamFormat: importRecord.seasonalTeamFormat,
      event: eventMetaFromImport(importRecord, linkedEvent),
    });
  }

  return { campaign, imports, teamFormatByEvent };
}

/**
 * Build one player's campaign results from by_player rows + optional per-import rank cache.
 * Avoids loading every campaign import for every player in a batch.
 */
async function loadPlayerCampaignDataCached(
  ctx: QueryCtx | MutationCtx,
  args: {
    playerId: Id<"players">;
    imports: CampaignImportRef[];
    includeMatchStats: boolean;
    includeOverallRanks: boolean;
    importCache: Map<
      Id<"thirdPartyImports">,
      { overallRankByTeam: Map<string, number> }
    >;
  },
) {
  const importById = new Map(
    args.imports.map((entry) => [entry.importRecord._id, entry] as const),
  );
  const importIds = new Set(importById.keys());

  const playerResults = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
    .collect();
  const campaignRows = playerResults.filter((row) => importIds.has(row.importId));

  const results: CampaignPlayerResult[] = [];
  for (const result of campaignRows) {
    const ref = importById.get(result.importId);
    if (!ref) continue;

    let overallLeaderboardPlacement = result.placement;
    if (args.includeOverallRanks) {
      let cached = args.importCache.get(result.importId);
      if (!cached) {
        const importResults = await ctx.db
          .query("thirdPartyResults")
          .withIndex("by_import", (q) => q.eq("importId", result.importId))
          .collect();
        cached = { overallRankByTeam: computeOverallLeaderboardRanks(importResults) };
        args.importCache.set(result.importId, cached);
      }
      overallLeaderboardPlacement =
        cached.overallRankByTeam.get(teamLeaderboardKey(result)) ?? result.placement;
    }

    results.push({
      ...result,
      importId: result.importId,
      eventId: ref.event._id,
      teamFormat: ref.teamFormat,
      event: ref.event,
      overallLeaderboardPlacement,
    });
  }

  let matchStats: Doc<"matchPlayerStats">[] = [];
  if (args.includeMatchStats) {
    const playerMatchStats = await ctx.db
      .query("matchPlayerStats")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    matchStats = playerMatchStats.filter((stat) => importIds.has(stat.importId));
  }

  return { results, matchStats };
}

async function loadPlayerCampaignResults(
  ctx: QueryCtx | MutationCtx,
  campaignId: Id<"seasonalCampaigns">,
  playerId: Id<"players">,
) {
  const { imports, teamFormatByEvent } = await listCampaignImportRefs(ctx, campaignId);
  const data = await loadPlayerCampaignDataCached(ctx, {
    playerId,
    imports,
    includeMatchStats: true,
    includeOverallRanks: true,
    importCache: new Map(),
  });
  return {
    results: data.results,
    matchStats: data.matchStats,
    teamFormatByEvent,
  };
}

function formatEventDate(event: CampaignEventMeta): string {
  const parsed = new Date(event.startDate);
  if (Number.isNaN(parsed.getTime())) return event.name || event.startDate || "Summer Slam scrim";
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

function evaluateReachTop(
  maxPlacement: number,
  data: Awaited<ReturnType<typeof loadPlayerCampaignResults>>,
) {
  const match = data.results.find(
    (result) => result.overallLeaderboardPlacement <= maxPlacement,
  );
  return {
    qualifies: !!match,
    current: match ? 1 : 0,
    target: 1,
    log: match
      ? `Auto-approved: Team finished Top ${maxPlacement} on the overall Yunite leaderboard (${match.teamFormat}) on ${formatEventDate(match.event)}.`
      : undefined,
  };
}

function ruleNeedsCoplay(rule: QualificationRule): boolean {
  if (!rule) return false;
  return (
    rule.type === "distinct_teammates" ||
    rule.type === "new_member_teammate" ||
    rule.type === "new_teammates"
  );
}

type PlayerCoplayContext = {
  /** Teammate Discord IDs per import (excluding the player). */
  teammatesByImport: Map<Id<"thirdPartyImports">, string[]>;
  /** Distinct Yunite leaderboard appearances per teammate Discord ID. */
  leaderboardCountByDiscordId: Map<string, number>;
};

async function resolveEpicToDiscordId(
  ctx: QueryCtx | MutationCtx,
  epicUsername: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const key = epicUsername.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const player = await ctx.db
    .query("players")
    .withIndex("by_epic_username", (q) => q.eq("epicUsername", epicUsername))
    .first();
  const discordId = player?.discordUserId ?? null;
  cache.set(key, discordId);
  // Also cache lowercase variant of stored epic if casing differs
  if (player?.epicUsername) {
    cache.set(player.epicUsername.trim().toLowerCase(), discordId);
  }
  return discordId;
}

async function countLeaderboardsForDiscordId(
  ctx: QueryCtx | MutationCtx,
  discordId: string,
  cache: Map<string, number>,
  /** Stop once this many distinct imports are known (enough to reject "new member"). */
  stopAt?: number,
): Promise<number> {
  if (cache.has(discordId)) return cache.get(discordId)!;
  const player = await ctx.db
    .query("players")
    .withIndex("by_discord_user_id", (q) => q.eq("discordUserId", discordId))
    .first();
  if (!player) {
    cache.set(discordId, Number.POSITIVE_INFINITY);
    return Number.POSITIVE_INFINITY;
  }

  // Use take() instead of paginate() — Convex allows only one paginated query per function,
  // and recalculation already paginates campaign import results.
  const takeCount = stopAt != null ? Math.max(stopAt * 20, 40) : 500;
  const results = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_player", (q) => q.eq("playerId", player._id))
    .take(takeCount);
  const count = new Set(results.map((result) => result.importId)).size;
  cache.set(discordId, count);
  return count;
}

async function loadTeammateDiscordIds(
  ctx: QueryCtx | MutationCtx,
  result: Doc<"thirdPartyResults">,
  self: { discordId: string | null; epicUsername: string | null },
  caches: {
    epicToDiscord: Map<string, string | null>;
    teamByImportTeamId: Map<string, string[]>;
  },
): Promise<string[]> {
  if (result.teamMembers && result.teamMembers.length > 0) {
    const ids: string[] = [];
    for (const epic of result.teamMembers) {
      if (
        self.epicUsername &&
        epic.trim().toLowerCase() === self.epicUsername.trim().toLowerCase()
      ) {
        continue;
      }
      const discordId = await resolveEpicToDiscordId(ctx, epic, caches.epicToDiscord);
      if (discordId && discordId !== self.discordId) ids.push(discordId);
    }
    return [...new Set(ids)];
  }

  if (!result.teamId) return [];

  const cacheKey = `${result.importId}:${result.teamId}`;
  let teamDiscordIds = caches.teamByImportTeamId.get(cacheKey);
  if (!teamDiscordIds) {
    const importResults = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", result.importId))
      .collect();
    teamDiscordIds = importResults
      .filter((row) => row.teamId === result.teamId && row.discordId)
      .map((row) => row.discordId!);
    caches.teamByImportTeamId.set(cacheKey, teamDiscordIds);
  }
  return [...new Set(teamDiscordIds.filter((id) => id !== self.discordId))];
}

async function loadPlayerCoplayContext(
  ctx: QueryCtx | MutationCtx,
  playerId: Id<"players">,
  options?: {
    /** When set, only build teammate maps for these imports (plus full history if includeFullHistory). */
    campaignImportIds?: Set<Id<"thirdPartyImports">>;
    /** Needed for new_teammates (prior coplay outside the current import). */
    includeFullHistory?: boolean;
    /** Needed for new_member_teammate. */
    includeLeaderboardCounts?: boolean;
    /** Early-exit threshold for leaderboard counting. */
    newMemberMaxEvents?: number;
  },
): Promise<PlayerCoplayContext> {
  const player = await ctx.db.get(playerId);
  const self = {
    discordId: player?.discordUserId ?? null,
    epicUsername: player?.epicUsername ?? null,
  };
  const allResults = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();

  const includeFullHistory = options?.includeFullHistory ?? true;
  const campaignImportIds = options?.campaignImportIds;
  const scopedResults =
    includeFullHistory || !campaignImportIds
      ? allResults
      : allResults.filter((result) => campaignImportIds.has(result.importId));

  const caches = {
    epicToDiscord: new Map<string, string | null>(),
    teamByImportTeamId: new Map<string, string[]>(),
  };
  const teammatesByImport = new Map<Id<"thirdPartyImports">, string[]>();
  const neededDiscordIds = new Set<string>();

  for (const result of scopedResults) {
    const teammates = await loadTeammateDiscordIds(ctx, result, self, caches);
    const existing = teammatesByImport.get(result.importId) ?? [];
    const merged = [...new Set([...existing, ...teammates])];
    teammatesByImport.set(result.importId, merged);
    for (const id of merged) neededDiscordIds.add(id);
  }

  const leaderboardCountByDiscordId = new Map<string, number>();
  if (options?.includeLeaderboardCounts !== false) {
    const stopAt = options?.newMemberMaxEvents;
    for (const discordId of neededDiscordIds) {
      await countLeaderboardsForDiscordId(ctx, discordId, leaderboardCountByDiscordId, stopAt);
    }
  }

  return { teammatesByImport, leaderboardCountByDiscordId };
}

async function evaluateRule(
  ctx: QueryCtx | MutationCtx,
  rule: QualificationRule,
  data: Awaited<ReturnType<typeof loadPlayerCampaignResults>>,
  playerId: Id<"players">,
  coplay: PlayerCoplayContext | null,
) {
  if (!rule) {
    return { qualifies: false, current: 0, target: 1, log: undefined as string | undefined };
  }

  const scrimsPlayed = new Set(data.results.map((result) => result.importId));
  if (rule.type === "play_events") {
    const target = requirePositiveInteger(rule.count, "Scrim count");
    return {
      qualifies: scrimsPlayed.size >= target,
      current: scrimsPlayed.size,
      target,
      log:
        scrimsPlayed.size >= target
          ? `Auto-approved: Played ${target} Summer Slam scrim${target === 1 ? "" : "s"}.`
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

  if (rule.type === "reach_top_5") {
    return evaluateReachTop(5, data);
  }

  if (rule.type === "reach_top_3") {
    return evaluateReachTop(3, data);
  }

  if (rule.type === "reach_top_10") {
    return evaluateReachTop(10, data);
  }

  if (rule.type === "win_game") {
    const teamFormatByImport = new Map(
      data.results.map((result) => [result.importId, result.teamFormat] as const),
    );
    const eventByImport = new Map(
      data.results.map((result) => [result.importId, result.event] as const),
    );
    const winningMatch = data.matchStats.find((stat) => {
      if (stat.placement !== 1) return false;
      if (!rule.teamFormat) return true;
      return teamFormatByImport.get(stat.importId) === rule.teamFormat;
    });
    const event = winningMatch ? eventByImport.get(winningMatch.importId) : undefined;
    const teamFormat = winningMatch
      ? teamFormatByImport.get(winningMatch.importId)
      : undefined;
    return {
      qualifies: !!winningMatch,
      current: winningMatch ? 1 : 0,
      target: 1,
      log: winningMatch
        ? `Auto-approved: Won a match${teamFormat ? ` in ${teamFormat}` : ""}${event ? ` on ${formatEventDate(event)}` : ""}.`
        : undefined,
    };
  }

  if (rule.type === "play_event_type") {
    const match = data.results.find((result) => result.event.type === rule.eventType);
    return {
      qualifies: !!match,
      current: match ? 1 : 0,
      target: 1,
      log: match
        ? `Auto-approved: Played a Showdown event on ${formatEventDate(match.event)}.`
        : undefined,
    };
  }

  if (rule.type === "distinct_teammates" || rule.type === "new_member_teammate" || rule.type === "new_teammates") {
    const context = coplay ?? (await loadPlayerCoplayContext(ctx, playerId));
    const campaignImportIds = [...scrimsPlayed];

    if (rule.type === "distinct_teammates") {
      const target = requirePositiveInteger(rule.count, "Teammate count");
      const teammates = new Set<string>();
      for (const importId of campaignImportIds) {
        for (const discordId of context.teammatesByImport.get(importId) ?? []) {
          teammates.add(discordId);
        }
      }
      return {
        qualifies: teammates.size >= target,
        current: teammates.size,
        target,
        log:
          teammates.size >= target
            ? `Auto-approved: Played with ${teammates.size} different teammates during Summer Slam.`
            : undefined,
      };
    }

    if (rule.type === "new_member_teammate") {
      const maxEvents = requirePositiveInteger(rule.maxEvents, "New member event limit");
      let best: { discordId: string; count: number; result: CampaignPlayerResult } | null = null;
      for (const result of data.results) {
        for (const discordId of context.teammatesByImport.get(result.importId) ?? []) {
          const count = context.leaderboardCountByDiscordId.get(discordId) ?? Number.POSITIVE_INFINITY;
          if (count < maxEvents && (!best || count < best.count)) {
            best = { discordId, count, result };
          }
        }
      }
      return {
        qualifies: !!best,
        current: best ? 1 : 0,
        target: 1,
        log: best
          ? `Auto-approved: Played with a new member (${best.count} prior event${best.count === 1 ? "" : "s"}) on ${formatEventDate(best.result.event)}.`
          : undefined,
      };
    }

    // new_teammates: teammates with no prior Yunite coplay outside this import
    const target = requirePositiveInteger(rule.count, "New teammate count");
    let bestCurrent = 0;
    let bestResult: CampaignPlayerResult | null = null;
    for (const result of data.results) {
      const teammates = context.teammatesByImport.get(result.importId) ?? [];
      const prior = new Set<string>();
      for (const [importId, ids] of context.teammatesByImport) {
        if (importId === result.importId) continue;
        for (const id of ids) prior.add(id);
      }
      const fresh = teammates.filter((id) => !prior.has(id));
      if (fresh.length > bestCurrent) {
        bestCurrent = fresh.length;
        bestResult = result;
      }
    }
    return {
      qualifies: bestCurrent >= target,
      current: Math.min(bestCurrent, target),
      target,
      log:
        bestCurrent >= target && bestResult
          ? `Auto-approved: Teamed with ${bestCurrent} player${bestCurrent === 1 ? "" : "s"} with no prior Yunite coplay on ${formatEventDate(bestResult.event)}.`
          : undefined,
    };
  }

  // Legacy rule evaluation for quests saved before rule simplification.
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

  if (rule.type === "reach_top") {
    const targetPlacement = requirePositiveInteger(rule.placement, "Placement");
    const neededEvents = requirePositiveInteger(rule.eventCount ?? 1, "Event count");
    const matches = data.results.filter(
      (result) =>
        result.overallLeaderboardPlacement <= targetPlacement &&
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
          ? `Auto-approved: Reached Top ${targetPlacement} on the overall Yunite leaderboard (${firstMatch.teamFormat}) on ${formatEventDate(firstMatch.event)}.`
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
      description: DEFAULT_CAMPAIGN_DESCRIPTION,
      isActive: true,
      submissionsEnabled: false,
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
    const campaign = await getCampaignBySlug(ctx, normalizeSlug(args.slug));
    if (!campaign) return null;
    const activeQuestCount = (
      await ctx.db
        .query("seasonalQuests")
        .withIndex("by_campaign_and_active", (q) =>
          q.eq("campaignId", campaign._id).eq("isActive", true),
        )
        .collect()
    ).filter((quest) => MAIN_QUEST_CATEGORIES.has(quest.category)).length;
    const publicCampaign = { ...campaign, activeQuestCount };
    if (campaign.description === LEGACY_CAMPAIGN_DESCRIPTION) {
      return { ...publicCampaign, description: DEFAULT_CAMPAIGN_DESCRIPTION };
    }
    return publicCampaign;
  },
});

export const getQuestLeaderboard = query({
  args: {
    slug: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const campaign = await getCampaignBySlug(ctx, normalizeSlug(args.slug));
    if (!campaign) return [];

    const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);

    // Only players who claimed a passport appear on the public leaderboard.
    // Auto-quest recalculation can approve stamps before a passport exists.
    const passports = await ctx.db
      .query("seasonalPassports")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    const passportPlayerIds = new Set(passports.map((passport) => passport.playerId));
    if (passportPlayerIds.size === 0) return [];

    const approvedRows = await ctx.db
      .query("seasonalQuestProgress")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", campaign._id).eq("status", "approved"),
      )
      .collect();

    const countsByPlayer = new Map<Id<"players">, number>();
    for (const row of approvedRows) {
      if (!passportPlayerIds.has(row.playerId)) continue;
      countsByPlayer.set(row.playerId, (countsByPlayer.get(row.playerId) ?? 0) + 1);
    }

    const sorted = [...countsByPlayer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const rows = [];
    for (const [playerId, completedQuests] of sorted) {
      const player = await ctx.db.get(playerId);
      rows.push({
        rank: rows.length + 1,
        displayName: player?.discordUsername ?? player?.epicUsername ?? "Unknown player",
        completedQuests,
      });
    }
    return rows;
  },
});

const categoryTaglinesValidator = v.object({
  traveller: v.optional(v.string()),
  competitor: v.optional(v.string()),
  summer_spirit: v.optional(v.string()),
  team_player: v.optional(v.string()),
  community: v.optional(v.string()),
  summer_legend: v.optional(v.string()),
});

function sanitizeCategoryTaglines(
  taglines: {
    traveller?: string;
    competitor?: string;
    summer_spirit?: string;
    team_player?: string;
    community?: string;
    summer_legend?: string;
  } | undefined,
) {
  if (!taglines) return undefined;
  const entries = (
    [
      ["traveller", taglines.traveller],
      ["competitor", taglines.competitor],
      ["summer_spirit", taglines.summer_spirit],
      ["team_player", taglines.team_player],
      ["community", taglines.community],
      ["summer_legend", taglines.summer_legend],
    ] as const
  )
    .map(([key, value]) => [key, sanitizeText(value, 160)] as const)
    .filter((entry): entry is readonly [typeof entry[0], string] => entry[1] != null);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as {
    traveller?: string;
    competitor?: string;
    summer_spirit?: string;
    team_player?: string;
    community?: string;
    summer_legend?: string;
  };
}

export const updateCampaign = mutation({
  args: {
    slug: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    submissionsEnabled: v.boolean(),
    stampName: v.string(),
    littleWheelEntryEveryStamps: v.number(),
    bigWheelEntryEveryStamps: v.number(),
    categoryTaglines: v.optional(categoryTaglinesValidator),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const title = sanitizeText(args.title, 120);
    const stampName = sanitizeText(args.stampName, 80);
    if (!title || !stampName) {
      throw new ConvexError({ message: "Campaign title and stamp name are required", code: "BAD_REQUEST" });
    }
    if (args.startsAt != null && args.endsAt != null && args.startsAt >= args.endsAt) {
      throw new ConvexError({ message: "Season start must be before season end", code: "BAD_REQUEST" });
    }

    await ctx.db.patch(campaign._id, {
      title,
      description: sanitizeText(args.description, 2000),
      isActive: args.isActive,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      submissionsEnabled: args.submissionsEnabled,
      stampName,
      littleWheelEntryEveryStamps: requirePositiveInteger(
        args.littleWheelEntryEveryStamps,
        "Little wheel stamp interval",
      ),
      bigWheelEntryEveryStamps: requirePositiveInteger(
        args.bigWheelEntryEveryStamps,
        "Big wheel stamp interval",
      ),
      categoryTaglines: sanitizeCategoryTaglines(args.categoryTaglines),
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

/**
 * Internal claim step after Discord ID is resolved from Clerk Discord OAuth.
 */
export const ensureMyPassportInternal = internalMutation({
  args: {
    slug: v.optional(v.string()),
    discordUserId: v.string(),
    discordUsername: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    passportId: Id<"seasonalPassports">;
    player: {
      _id: Id<"players">;
      discordUsername?: string;
      epicUsername?: string;
    };
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    await provisionViewerUser(ctx, {
      tokenIdentifier: identity.tokenIdentifier,
      profilePatch: buildProfilePatch(identity, args.discordUsername),
      discordUserId: args.discordUserId,
      auditSource: "passport-claim",
    });

    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const admin = await resolveCurrentAdmin(ctx);
    assertPassportAccessible(campaign, Date.now(), { allowAdminEarlyAccess: !!admin });

    const player = await findPlayerByDiscordUserId(ctx, args.discordUserId);
    if (!player) {
      throw new ConvexError({
        message:
          "We couldn’t find a ZBD player profile linked to your Discord account. Please make sure you’ve played/registered with this Discord account or contact staff.",
        code: "PLAYER_NOT_LINKED",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    const existing = await ctx.db
      .query("seasonalPassports")
      .withIndex("by_campaign_and_player", (q) =>
        q.eq("campaignId", campaign._id).eq("playerId", player._id),
      )
      .first();
    const now = Date.now();
    let passportId: Id<"seasonalPassports">;
    if (existing) {
      await ctx.db.patch(existing._id, { lastViewedAt: now, userId: user._id });
      passportId = existing._id;
    } else {
      passportId = await ctx.db.insert("seasonalPassports", {
        campaignId: campaign._id,
        playerId: player._id,
        userId: user._id,
        createdAt: now,
        lastViewedAt: now,
      });
      await logSeasonalAudit(ctx, {
        campaignId: campaign._id,
        playerId: player._id,
        adminId: user._id,
        action: "passport_created",
        note: player.discordUsername ?? args.discordUserId,
      });
    }

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

/**
 * @deprecated Prefer seasonalClaim.ensureMyPassport (fetches Discord ID from Clerk).
 * Kept so older clients keep working after Discord IDs were backfilled on users.
 */
export const ensureMyPassport = mutation({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{
    passportId: Id<"seasonalPassports">;
    player: {
      _id: Id<"players">;
      discordUsername?: string;
      epicUsername?: string;
    };
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const discordUserId =
      getDiscordUserIdFromIdentity(identity) ??
      (
        await ctx.db
          .query("users")
          .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
          .first()
      )?.discordUserId;

    if (!discordUserId) {
      throw new ConvexError({
        message:
          "Sign in with Discord to claim your passport. We couldn’t find a Discord account on your login.",
        code: "DISCORD_NOT_LINKED",
      });
    }

    return await ctx.runMutation(internal.seasonal.ensureMyPassportInternal, {
      slug: args.slug,
      discordUserId,
    });
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

export const setPassportBirthplace = mutation({
  args: {
    slug: v.optional(v.string()),
    birthplaceId: passportBirthplaceIdValidator,
  },
  handler: async (ctx, args) => {
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    if (!campaign.isActive) {
      throw new ConvexError({ message: "Campaign is not active", code: "CAMPAIGN_INACTIVE" });
    }
    const { passportId } = await requireCurrentPassport(ctx, campaign);
    await ctx.db.patch(passportId, { birthplaceId: args.birthplaceId });
    return { birthplaceId: args.birthplaceId };
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

/** Admin list of Summer Slam tagged events with event details. */
export const getAdminTaggedEvents = query({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const tags = await ctx.db
      .query("seasonalCampaignEvents")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();

    const rows = [];
    for (const tag of tags) {
      const event = await ctx.db.get(tag.eventId);
      rows.push({
        tagId: tag._id,
        eventId: tag.eventId,
        teamFormat: tag.teamFormat,
        updatedAt: tag.updatedAt,
        event: event
          ? {
              name: event.name,
              startDate: event.startDate,
              endDate: event.endDate,
              type: event.type,
              mode: event.mode,
              status: event.status,
            }
          : null,
      });
    }

    return rows.sort((a, b) => {
      const aDate = a.event?.startDate ?? "";
      const bDate = b.event?.startDate ?? "";
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return (a.event?.name ?? "").localeCompare(b.event?.name ?? "");
    });
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
        importIndex: 0,
        resultsCursor: null,
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
      importIndex: 0,
        resultsCursor: null,
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
        importIndex: 0,
        resultsCursor: null,
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
      importIndex: 0,
        resultsCursor: null,
    });

    return { deleted: true };
  },
});

export const generateEvidenceUploadUrl = mutation({
  args: { slug: v.optional(v.string()) },
  handler: async () => {
    throw new ConvexError({
      message:
        "Image uploads are no longer supported. Host your screenshot on https://postimages.org/ and paste the link instead.",
      code: "BAD_REQUEST",
    });
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
    const admin = await resolveCurrentAdmin(ctx);
    assertSubmissionsOpen(campaign, Date.now(), { allowAdminEarlyAccess: !!admin });
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
    if (images.length > 0) {
      throw new ConvexError({
        message:
          "Image uploads are no longer supported. Host your screenshot on https://postimages.org/ and paste the link instead.",
        code: "BAD_REQUEST",
      });
    }

    const evidenceUrls = (args.evidenceUrls ?? []).map(validateHttpUrl);
    const notes = sanitizeText(args.notes, 2000);
    if ((quest.evidenceInput === "link" || quest.evidenceInput === "image") && evidenceUrls.length === 0) {
      throw new ConvexError({
        message:
          quest.evidenceInput === "image"
            ? "This quest requires a screenshot link. Upload to https://postimages.org/ and paste the URL."
            : "This quest requires an evidence link",
        code: "BAD_REQUEST",
      });
    }
    if (evidenceUrls.length === 0 && !notes) {
      throw new ConvexError({ message: "Add at least one link or note", code: "BAD_REQUEST" });
    }

    const evidenceTypes = new Set(args.evidenceTypes);
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
        activeQuests: quests.filter(
          (quest) => quest.isActive && MAIN_QUEST_CATEGORIES.has(quest.category),
        ).length,
        pendingSubmissions: submissions.filter((submission) => submission.status === "pending_review").length,
        approvedStamps: progress
          .filter((row) => row.status === "approved")
          .reduce((total, row) => total + row.stampReward, 0),
        autoApproved: progress.filter(
          (row) => row.status === "approved" && row.awardSource === "auto",
        ).length,
      },
    };
  },
});

/** Admin list of auto-approved quest stamps (who × which quest). */
export const getAutoApprovedProgress = query({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const campaign = await requireCampaign(ctx, normalizeSlug(args.slug));
    const progressRows = (
      await ctx.db
        .query("seasonalQuestProgress")
        .withIndex("by_campaign_and_status", (q) =>
          q.eq("campaignId", campaign._id).eq("status", "approved"),
        )
        .collect()
    ).filter((row) => row.awardSource === "auto");

    const playerIds = [...new Set(progressRows.map((row) => row.playerId))];
    const questIds = [...new Set(progressRows.map((row) => row.questId))];
    const players = new Map<Id<"players">, Doc<"players"> | null>();
    const quests = new Map<Id<"seasonalQuests">, Doc<"seasonalQuests"> | null>();
    for (const playerId of playerIds) {
      players.set(playerId, await ctx.db.get(playerId));
    }
    for (const questId of questIds) {
      quests.set(questId, await ctx.db.get(questId));
    }

    return progressRows
      .map((progress) => ({
        progress,
        player: players.get(progress.playerId) ?? null,
        quest: quests.get(progress.questId) ?? null,
      }))
      .sort((a, b) => (b.progress.approvedAt ?? 0) - (a.progress.approvedAt ?? 0));
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
    const campaign = await ctx.db.get(submission.campaignId);
    if (!campaign) {
      throw new ConvexError({ message: "Campaign not found", code: "NOT_FOUND" });
    }
    const { player: reviewerPlayer } = await resolveCurrentPlayer(ctx);
    const allowSelfReviewForTesting = isAdminCampaignPreview(campaign);
    if (reviewerPlayer?._id === submission.playerId && !allowSelfReviewForTesting) {
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
      importIndex: 0,
        resultsCursor: null,
    });
    return { success: true };
  },
});

export const recalculateCampaignInternal = internalMutation({
  args: {
    campaignId: v.id("seasonalCampaigns"),
    /** Which campaign import we are scanning for players. */
    importIndex: v.optional(v.number()),
    /** Pagination cursor within the current import's results. */
    resultsCursor: v.optional(v.union(v.string(), v.null())),
    /** Legacy args from older scheduled jobs — ignored. */
    playerOffset: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) return;
    const autoQuests = (
      await ctx.db
        .query("seasonalQuests")
        .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
        .collect()
    ).filter((quest) => quest.isActive && quest.completionMethod === "auto");
    if (autoQuests.length === 0) {
      await logSeasonalAudit(ctx, {
        campaignId: args.campaignId,
        action: "recalculate_completed",
        note: "No active auto quests.",
      });
      return;
    }

    const { imports, teamFormatByEvent } = await listCampaignImportRefs(ctx, args.campaignId);
    if (imports.length === 0) {
      await logSeasonalAudit(ctx, {
        campaignId: args.campaignId,
        action: "recalculate_completed",
        note: "No campaign imports/tagged events to recalculate.",
      });
      return;
    }

    const importIndex = args.importIndex ?? 0;
    if (importIndex >= imports.length) {
      await logSeasonalAudit(ctx, {
        campaignId: args.campaignId,
        action: "recalculate_completed",
        note: `Finished scanning ${imports.length} campaign import(s).`,
      });
      return;
    }

    const needsMatchStats = autoQuests.some(
      (quest) => quest.qualificationRule?.type === "win_game",
    );
    const needsOverallRanks = autoQuests.some((quest) => {
      const type = quest.qualificationRule?.type;
      return type === "reach_top_5" || type === "reach_top_3" || type === "reach_top_10";
    });
    const needsCoplay = autoQuests.some((quest) => ruleNeedsCoplay(quest.qualificationRule));
    const needsFullCoplayHistory = autoQuests.some(
      (quest) => quest.qualificationRule?.type === "new_teammates",
    );
    const needsLeaderboardCounts = autoQuests.some(
      (quest) => quest.qualificationRule?.type === "new_member_teammate",
    );
    const newMemberMaxEvents = autoQuests.reduce<number | undefined>((max, quest) => {
      if (quest.qualificationRule?.type !== "new_member_teammate") return max;
      const value = quest.qualificationRule.maxEvents;
      if (typeof value !== "number") return max;
      return max == null ? value : Math.max(max, value);
    }, undefined);

    const current = imports[importIndex]!;
    const page = await ctx.db
      .query("thirdPartyResults")
      .withIndex("by_import", (q) => q.eq("importId", current.importRecord._id))
      .paginate({
        // Teammate rules are expensive; one result row (= one player) per invocation.
        numItems: needsCoplay ? 1 : 30,
        cursor: args.resultsCursor ?? null,
      });

    const playerIds = [
      ...new Set(
        page.page
          .map((row) => row.playerId)
          .filter((playerId): playerId is Id<"players"> => playerId != null),
      ),
    ];

    const importCache = new Map<
      Id<"thirdPartyImports">,
      { overallRankByTeam: Map<string, number> }
    >();
    const campaignImportIds = new Set(imports.map((entry) => entry.importRecord._id));
    let approvedInBatch = 0;

    for (const playerId of playerIds) {
      const loaded = await loadPlayerCampaignDataCached(ctx, {
        playerId,
        imports,
        includeMatchStats: needsMatchStats,
        includeOverallRanks: needsOverallRanks,
        importCache,
      });
      const data = {
        results: loaded.results,
        matchStats: loaded.matchStats,
        teamFormatByEvent,
      };
      const coplay = needsCoplay
        ? await loadPlayerCoplayContext(ctx, playerId, {
            campaignImportIds,
            includeFullHistory: needsFullCoplayHistory,
            includeLeaderboardCounts: needsLeaderboardCounts,
            newMemberMaxEvents,
          })
        : null;
      for (const quest of autoQuests) {
        const evaluation = await evaluateRule(
          ctx,
          quest.qualificationRule,
          data,
          playerId,
          coplay,
        );
        const nextStatus = evaluation.qualifies
          ? "approved"
          : evaluation.current > 0
            ? "in_progress"
            : "not_started";
        await setProgress(ctx, {
          campaignId: args.campaignId,
          quest,
          playerId,
          status: nextStatus,
          progressCurrent: evaluation.current,
          progressTarget: evaluation.target,
          awardSource: evaluation.qualifies ? "auto" : undefined,
          awardLog: evaluation.log,
        });
        if (evaluation.qualifies && evaluation.log) {
          approvedInBatch += 1;
          await logSeasonalAudit(ctx, {
            campaignId: args.campaignId,
            questId: quest._id,
            playerId,
            action: "quest_auto_approved",
            note: evaluation.log,
          });
        }
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.seasonal.recalculateCampaignInternal, {
        campaignId: args.campaignId,
        importIndex,
        resultsCursor: page.continueCursor,
      });
      return;
    }

    const nextImportIndex = importIndex + 1;
    if (nextImportIndex < imports.length) {
      await ctx.scheduler.runAfter(0, internal.seasonal.recalculateCampaignInternal, {
        campaignId: args.campaignId,
        importIndex: nextImportIndex,
        resultsCursor: null,
      });
      return;
    }

    await logSeasonalAudit(ctx, {
      campaignId: args.campaignId,
      action: "recalculate_completed",
      note: `Finished ${imports.length} import(s); last page auto-approved ${approvedInBatch}.`,
    });
  },
});

export const recalculatePlayerForImport = internalMutation({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) return;

    const campaignIds = new Set<Id<"seasonalCampaigns">>();

    if (importRecord.eventId) {
      const tags = await ctx.db
        .query("seasonalCampaignEvents")
        .withIndex("by_event", (q) => q.eq("eventId", importRecord.eventId!))
        .collect();
      for (const tag of tags) {
        campaignIds.add(tag.campaignId);
      }
    }

    if (importRecord.seasonalCampaignSlug) {
      const campaign = await getCampaignBySlug(ctx, importRecord.seasonalCampaignSlug);
      if (campaign) {
        campaignIds.add(campaign._id);
      }
    }

    for (const campaignId of campaignIds) {
      await ctx.scheduler.runAfter(0, internal.seasonal.recalculateCampaignInternal, {
        campaignId,
        importIndex: 0,
        resultsCursor: null,
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
