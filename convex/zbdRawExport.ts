import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import {
  mapCompetitionEvent,
  mapEvaluation,
  mapEventPenalty,
  mapEventResultEntry,
  mapIdentityAlias,
  mapInGameEarnings,
  mapManualEventResult,
  mapMatchParticipation,
  mapMatchStatOverride,
  mapMembershipApplication,
  mapMembershipStatusEvent,
  mapPlayer,
  mapPreassignedRoster,
  mapPrizeEarning,
  mapReplayMatch,
  mapReplayPlayerResult,
  mapResultBatch,
  mapTierChange,
  mapTierSnapshot,
} from "./lib/zbdRaw/mappers";
import {
  ZBD_RAW_COLLECTIONS,
  ZBD_RAW_CONTRACT,
  ZBD_RAW_SCHEMA_VERSION,
  type ZbdRawCollectionName,
  type ZbdRawValidationCollection,
  type ZbdRawValidationReport,
} from "./lib/zbdRaw/types";
import { normalizeJoinedAt } from "./lib/playerJoinedAt";

const PAGE_SIZE = 200;

type PageResult<T> = {
  records: T[];
  continueCursor: string;
  isDone: boolean;
};

function hasRealDiscordUserId(discordUserId: string | undefined): boolean {
  return (
    !!discordUserId &&
    !discordUserId.startsWith("placeholder_") &&
    discordUserId !== "imported"
  );
}

export const getContractMeta = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return {
      contract: ZBD_RAW_CONTRACT,
      schemaVersion: ZBD_RAW_SCHEMA_VERSION,
      collections: [...ZBD_RAW_COLLECTIONS],
      pageSize: PAGE_SIZE,
    };
  },
});

export const getJoinedAtCoverageReport = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const players = await ctx.db.query("players").collect();
    let withJoinedAt = 0;
    let withMalformedJoinedAt = 0;
    let missingJoinedAt = 0;
    let eligibleForDiscordSyncBackfill = 0;
    let unknownUntilManualOrDiscordLookup = 0;

    for (const player of players) {
      if (player.joinedAt !== undefined) {
        if (normalizeJoinedAt(player.joinedAt) === player.joinedAt) {
          withJoinedAt++;
        } else {
          withMalformedJoinedAt++;
        }
        continue;
      }

      missingJoinedAt++;
      const reviewableStatus =
        player.currentMembershipStatus === "accepted" ||
        player.currentMembershipStatus === "former" ||
        player.status === "active" ||
        player.status === "discord_member";
      if (
        hasRealDiscordUserId(player.discordUserId) &&
        player.hasLeftServer !== true &&
        reviewableStatus
      ) {
        eligibleForDiscordSyncBackfill++;
      } else {
        unknownUntilManualOrDiscordLookup++;
      }
    }

    return {
      totalPlayers: players.length,
      withJoinedAt,
      withMalformedJoinedAt,
      missingJoinedAt,
      eligibleForDiscordSyncBackfill,
      unknownUntilManualOrDiscordLookup,
      notes: [
        "eligibleForDiscordSyncBackfill means the player has a real Discord ID and appears reviewable; the Discord sync/backfill path can populate joinedAt if the member is still in the guild.",
        "unknownUntilManualOrDiscordLookup includes placeholders, imported/manual records, left-server records, and records whose Discord membership timestamp cannot be proven from local data alone.",
      ],
    };
  },
});

export const pagePlayers = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (
    ctx,
    args,
  ): Promise<PageResult<ReturnType<typeof mapPlayer>>> => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("players").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapPlayer),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageIdentityAliases = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("playerDiscordAliases").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapIdentityAlias),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageTierChanges = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("tierHistory").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapTierChange),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageEvaluations = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("manualScores").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapEvaluation),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageMembershipApplications = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("applications").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapMembershipApplication),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageMembershipStatusEvents = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("statusEvents").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapMembershipStatusEvent),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageCompetitionEvents = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("events").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapCompetitionEvent),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageResultBatches = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("thirdPartyImports").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });

    const records = [];
    for (const row of page.page) {
      let linkedEventIsNoMoney: boolean | null = null;
      if (row.eventId) {
        const event = await ctx.db.get(row.eventId);
        linkedEventIsNoMoney =
          event == null ? null : event.isNoMoneyEvent === true;
      }
      records.push(mapResultBatch(row, linkedEventIsNoMoney));
    }

    return {
      records,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageEventResultEntries = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("thirdPartyResults").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });

    const importCache = new Map<string, string | null>();
    const records = [];
    for (const row of page.page) {
      const importKey = row.importId as string;
      if (!importCache.has(importKey)) {
        const importDoc = await ctx.db.get(row.importId);
        importCache.set(importKey, importDoc?.eventId ?? null);
      }
      records.push(
        mapEventResultEntry(row, importCache.get(importKey) ?? null),
      );
    }

    return {
      records,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageMatchParticipations = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("matchPlayerStats").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });

    const importCache = new Map<string, string | null>();
    const records = [];
    for (const row of page.page) {
      const importKey = row.importId as string;
      if (!importCache.has(importKey)) {
        const importDoc = await ctx.db.get(row.importId);
        importCache.set(importKey, importDoc?.eventId ?? null);
      }
      records.push(
        mapMatchParticipation(row, importCache.get(importKey) ?? null),
      );
    }

    return {
      records,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageMatchStatOverrides = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("matchEliminationOverrides").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapMatchStatOverride),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageManualEventResults = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("eventResults").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapManualEventResult),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pagePreassignedRosters = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("eventDuoPairs").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapPreassignedRoster),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageTierSnapshots = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("showdownTierSnapshots").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapTierSnapshot),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageEventPenalties = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("eventPenalties").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapEventPenalty),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pagePrizeEarnings = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("playerEarnings").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapPrizeEarning),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageInGameEarnings = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("inGameEarnings").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapInGameEarnings),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageReplayMatches = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("replays").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapReplayMatch),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const pageReplayPlayerResults = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const page = await ctx.db.query("replayPlayerStats").paginate({
      numItems: PAGE_SIZE,
      cursor: args.cursor,
    });
    return {
      records: page.page.map(mapReplayPlayerResult),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const getValidationReport = query({
  args: {},
  handler: async (ctx): Promise<ZbdRawValidationReport> => {
    await requireAdmin(ctx);

    // Qualitative producer capability report — live counts come from a produced document.
    // Avoid full-table scans here (can timeout on large matchParticipations volumes).
    const collections: ZbdRawValidationCollection[] = [
      {
        collection: "players",
        status: "complete",
        sourceTable: "players",
        recordCount: -1,
        notes:
          "Includes canonical joinedAt when populated from Discord joined_at. Analytics caches (TC/DCA/topFive) excluded. Denorm activity fields excluded. Live count after produce.",
      },
      {
        collection: "identityAliases",
        status: "complete",
        sourceTable: "playerDiscordAliases",
        recordCount: -1,
        notes: "Alternate Discord IDs stored in alias table.",
      },
      {
        collection: "tierChanges",
        status: "partial",
        sourceTable: "tierHistory",
        recordCount: -1,
        notes:
          "changedAt uses _creationTime — no dedicated event-time column on tierHistory.",
      },
      {
        collection: "evaluations",
        status: "partial",
        sourceTable: "manualScores",
        recordCount: -1,
        notes:
          "Website typically upserts one score doc per player — full historical evaluation revisions are not retained as separate rows. evaluatedAt uses _creationTime.",
      },
      {
        collection: "membershipApplications",
        status: "complete",
        sourceTable: "applications",
        recordCount: -1,
        notes: "Application lifecycle facts.",
      },
      {
        collection: "membershipStatusEvents",
        status: "complete",
        sourceTable: "statusEvents",
        recordCount: -1,
        notes: "Membership/application status audit trail.",
      },
      {
        collection: "competitionEvents",
        status: "partial",
        sourceTable: "events",
        recordCount: -1,
        notes:
          "teamFormat inferred from event type / smdTeamSize when not explicit. Leaderboard URL lists omitted (config, not outcomes).",
      },
      {
        collection: "resultBatches",
        status: "partial",
        sourceTable: "thirdPartyImports",
        recordCount: -1,
        notes:
          "occurredAt prefers tournamentStartedAt then eventDate. excludeFromCompetitiveAnalytics only when linked event.isNoMoneyEvent is set.",
      },
      {
        collection: "eventResultEntries",
        status: "complete",
        sourceTable: "thirdPartyResults",
        recordCount: -1,
        notes:
          "Includes unmatched rows. Provider-normalized; no Yunite payload shapes.",
      },
      {
        collection: "matchParticipations",
        status: "partial",
        sourceTable: "matchPlayerStats",
        recordCount: -1,
        notes:
          "Only present when match data was synced for a batch. Session wall-clock timestamps beyond sessionId are not stored on this table.",
      },
      {
        collection: "matchStatOverrides",
        status: "complete",
        sourceTable: "matchEliminationOverrides",
        recordCount: -1,
        notes: "Human corrections to match eliminations.",
      },
      {
        collection: "manualEventResults",
        status: "partial",
        sourceTable: "eventResults",
        recordCount: -1,
        notes:
          "Weaker teammate identity than event/match grains. Kept as stored facts.",
      },
      {
        collection: "preassignedRosters",
        status: "complete",
        sourceTable: "eventDuoPairs",
        recordCount: -1,
        notes: "Pre-event duo/trio assignments (SMD).",
      },
      {
        collection: "tierSnapshots",
        status: "complete",
        sourceTable: "showdownTierSnapshots",
        recordCount: -1,
        notes: "Event-locked Official Tier snapshots.",
      },
      {
        collection: "eventPenalties",
        status: "complete",
        sourceTable: "eventPenalties",
        recordCount: -1,
        notes: "Recorded showdown/event penalties.",
      },
      {
        collection: "prizeEarnings",
        status: "complete",
        sourceTable: "playerEarnings",
        recordCount: -1,
        notes: "ZBD prize earning records.",
      },
      {
        collection: "inGameEarnings",
        status: "complete",
        sourceTable: "inGameEarnings",
        recordCount: -1,
        notes: "Fetched official in-game earnings snapshots as stored.",
      },
      {
        collection: "replayMatches",
        status: "complete",
        sourceTable: "replays",
        recordCount: -1,
        notes:
          "Parsed metadata only — binary replay files are not part of the contract.",
      },
      {
        collection: "replayPlayerResults",
        status: "complete",
        sourceTable: "replayPlayerStats",
        recordCount: -1,
        notes: "Parsed per-player replay stats.",
      },
    ];

    const assumptions = [
      "tierChanges.changedAt and evaluations.evaluatedAt use Convex _creationTime because dedicated event-time columns do not exist.",
      "competitionEvents.teamFormat is derived from stored event.type / smdTeamSize (product configuration facts), not from analytics.",
      "resultBatches.sourceSystem is normalized from thirdPartyImports.source / isManualImport labels.",
      "players.evaluationTotalScore / officialTier are committed snapshots on the player record, not live recalculations.",
      "players.joinedAt is the canonical ZBD Discord/community join timestamp and is only populated from trusted Discord membership sync data; unknown values export as null.",
      "No contributionScore, dcaCache, topFiveCache, holistic, evaluationStatus, or aggregate caches are exported.",
      "Historical evaluation revisions are limited to whatever manualScores documents exist (usually current upsert).",
      "Live record counts are filled by the producer UI after assembling a document (validation query avoids full-table scans).",
    ];

    const dataQualityIssues = [
      "If matchParticipations count is 0 while eventResultEntries > 0 after produce, match-grain sync is incomplete for historical imports.",
      "Players without manualScores are expected for discord_member / unevaluated records.",
      "Players created by manual/admin/import paths may have legacy serverJoinDate but no canonical joinedAt until Discord sync confirms joined_at.",
      "Early players may have officialTier on players.tier without corresponding tierHistory rows.",
    ];

    const summary = {
      complete: collections.filter((c) => c.status === "complete").length,
      partial: collections.filter((c) => c.status === "partial").length,
      blocked: collections.filter((c) => c.status === "blocked").length,
    };

    const missing = ZBD_RAW_COLLECTIONS.filter(
      (name) => !collections.some((c) => c.collection === name),
    );
    for (const name of missing as ZbdRawCollectionName[]) {
      collections.push({
        collection: name,
        status: "blocked",
        sourceTable: "unknown",
        recordCount: -1,
        notes: "Producer mapping missing for this collection.",
      });
    }
    summary.blocked = collections.filter((c) => c.status === "blocked").length;

    return {
      contract: ZBD_RAW_CONTRACT,
      schemaVersion: ZBD_RAW_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      collections,
      assumptions,
      dataQualityIssues,
      summary,
    };
  },
});
