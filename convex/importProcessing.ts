import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { requireAdmin, getDisplayName } from "./auth_helpers";
import { matchPlayerForImport } from "./lib/playerIdentity";
import { appendLeaderboardUrlToEvent } from "./lib/eventLeaderboardLinks";
import { refreshEventCache, refreshEventCacheForImport } from "./lib/eventCache";
import {
  collectEventLeaderboardUrls,
  extractTournamentIdFromLeaderboardId,
  extractTournamentIdFromUrl,
} from "./lib/yunite";
import {
  isImportFinalized,
  isRateLimitError,
  isYuniteSource,
  postStepStatus,
  progressMessageForStep,
  resolveNextStep,
  retryDelayMsForRateLimit,
  type ImportPipelineStep,
} from "./lib/importPipeline";

async function getUserFromIdentity(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .first();
  if (!user) {
    throw new Error("User not found");
  }
  return { identity, user };
}

async function rematchImportInternal(ctx: MutationCtx, importId: Id<"thirdPartyImports">) {
  const importRecord = await ctx.db.get(importId);
  if (!importRecord) {
    throw new Error("Import not found");
  }

  const results = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_import", (q) => q.eq("importId", importId))
    .collect();

  const allPlayersList = await ctx.db.query("players").collect();
  const allPlayers = allPlayersList.filter(
    (p) => p.status === "active" || p.status === undefined,
  );

  let playersMatched = 0;
  let playersUnmatched = 0;

  for (const result of results) {
    const matchedPlayer = matchPlayerForImport(allPlayers, {
      discordId: result.discordId,
      epicId: result.epicId,
      epicUsername: result.epicUsername,
      discordUsername: result.discordUsername,
    }).player;

    const isNowMatched = !!matchedPlayer;
    if (isNowMatched) {
      playersMatched += 1;
    } else {
      playersUnmatched += 1;
    }

    if (result.matched !== isNowMatched || result.playerId !== matchedPlayer?._id) {
      await ctx.db.patch(result._id, {
        playerId: matchedPlayer?._id,
        matched: isNowMatched,
      });
    }
  }

  await ctx.db.patch(importId, { playersMatched, playersUnmatched });
  return { playersMatched, playersUnmatched };
}

async function findCandidateEventsForImport(
  ctx: MutationCtx,
  importRecord: Doc<"thirdPartyImports">,
) {
  const tournamentId = extractTournamentIdFromLeaderboardId(importRecord.leaderboardId);
  if (!tournamentId) {
    return [];
  }

  const events = await ctx.db.query("events").collect();
  const matches: Doc<"events">[] = [];

  for (const event of events) {
    const urls = collectEventLeaderboardUrls(event);
    for (const url of urls) {
      if (extractTournamentIdFromUrl(url) === tournamentId) {
        matches.push(event);
        break;
      }
    }
  }

  return matches;
}

async function tryAutoLinkImport(
  ctx: MutationCtx,
  importId: Id<"thirdPartyImports">,
) {
  const importRecord = await ctx.db.get(importId);
  if (!importRecord) {
    throw new Error("Import not found");
  }
  if (importRecord.eventId) {
    return { linked: true, eventId: importRecord.eventId, reason: "already_linked" as const };
  }

  const candidates = await findCandidateEventsForImport(ctx, importRecord);
  if (candidates.length === 0) {
    return { linked: false, reason: "no_candidate" as const };
  }
  if (candidates.length > 1) {
    return {
      linked: false,
      reason: "ambiguous" as const,
      candidateCount: candidates.length,
      candidateNames: candidates.slice(0, 5).map((e) => e.name),
    };
  }

  const eventId = candidates[0]._id;
  await ctx.db.patch(importId, { eventId });
  await appendLeaderboardUrlToEvent(ctx, eventId, importRecord.leaderboardUrl);

  const eventResults = await ctx.db
    .query("eventResults")
    .withIndex("by_import", (q) => q.eq("importId", importId))
    .collect();
  for (const result of eventResults) {
    await ctx.db.patch(result._id, { eventId });
  }

  await refreshEventCache(ctx, eventId);

  return { linked: true, eventId, reason: "auto_linked" as const };
}

async function validateImportResults(
  ctx: MutationCtx,
  importRecord: Doc<"thirdPartyImports">,
) {
  if (importRecord.totalPlayers <= 0) {
    return { valid: false, reason: "Import has no players." };
  }

  const sample = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_import", (q) => q.eq("importId", importRecord._id))
    .first();

  if (!sample) {
    return { valid: false, reason: "No normalized results found for this import." };
  }

  if (isYuniteSource(importRecord.source) && !importRecord.matchDataSynced) {
    return { valid: false, reason: "Yunite match data has not been synced yet." };
  }

  if (importRecord.playersUnmatched > 0) {
    return {
      valid: false,
      reason: `${importRecord.playersUnmatched} players could not be matched. Review unmatched players.`,
      code: "unmatched_players" as const,
    };
  }

  if (!importRecord.eventId) {
    return {
      valid: false,
      reason: "Import is not linked to an event.",
      code: "event_link_missing" as const,
    };
  }

  return { valid: true as const };
}

export const getImportProcessingJob = query({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const jobs = await ctx.db
      .query("importProcessingJobs")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();

    const latest = jobs.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
    const imp = await ctx.db.get(args.importId);

    return {
      import: imp
        ? {
            _id: imp._id,
            eventName: imp.eventName,
            pipelineStatus: imp.pipelineStatus,
            pipelineError: imp.pipelineError,
            pipelineErrorCode: imp.pipelineErrorCode,
            finalizedAt: imp.finalizedAt,
            pipelineLocked: imp.pipelineLocked,
            matchDataSynced: imp.matchDataSynced,
            playersMatched: imp.playersMatched,
            playersUnmatched: imp.playersUnmatched,
            eventId: imp.eventId,
          }
        : null,
      job: latest,
    };
  },
});

export const startProcessImport = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
  },
  handler: async (ctx, args) => {
    const { user } = await getUserFromIdentity(ctx);

    const imp = await ctx.db.get(args.importId);
    if (!imp) {
      throw new Error("Import not found");
    }
    if (imp.pipelineStatus === "Ignored") {
      throw new Error("This import is marked as ignored.");
    }
    if (isImportFinalized(imp) && imp.pipelineLocked) {
      throw new Error("Import is finalized. Unlock or reprocess to run again.");
    }

    const running = await ctx.db
      .query("importProcessingJobs")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .filter((q) => q.eq(q.field("status"), "running"))
      .first();
    if (running) {
      throw new Error("Import processing is already running.");
    }

    const now = Date.now();
    const jobId = await ctx.db.insert("importProcessingJobs", {
      importId: args.importId,
      status: "running",
      progressMessage: "Starting Process Import…",
      forceReprocess: false,
      retryCount: 0,
      startedBy: user._id,
      startedByName: getDisplayName(user),
      startedAt: now,
      lastProgressAt: now,
    });

    await ctx.db.patch(args.importId, {
      pipelineStatus: imp.pipelineStatus ?? "Imported",
      pipelineStatusUpdatedAt: now,
      pipelineError: undefined,
      pipelineErrorCode: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.importProcessingActions.runProcessingStep, {
      jobId,
    });

    return { jobId };
  },
});

export const unlockImport = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await getUserFromIdentity(ctx);

    const imp = await ctx.db.get(args.importId);
    if (!imp) {
      throw new Error("Import not found");
    }

    await ctx.db.patch(args.importId, {
      pipelineLocked: false,
      pipelineStatus: imp.eventId ? "Linked To Event" : "Imported",
      pipelineStatusUpdatedAt: Date.now(),
      pipelineError: undefined,
      pipelineErrorCode: undefined,
      finalizedAt: undefined,
      finalizedBy: undefined,
    });

    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userName: getDisplayName(user),
      action: "import_unlocked",
      entityType: "thirdPartyImport",
      entityId: args.importId,
      details: JSON.stringify({ reason: args.reason ?? "Unlocked for reprocessing" }),
    });

    return { success: true };
  },
});

export const reprocessImport = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await getUserFromIdentity(ctx);

    const imp = await ctx.db.get(args.importId);
    if (!imp) {
      throw new Error("Import not found");
    }

    const running = await ctx.db
      .query("importProcessingJobs")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .filter((q) => q.eq(q.field("status"), "running"))
      .first();
    if (running) {
      throw new Error("Import processing is already running.");
    }

    await ctx.db.patch(args.importId, {
      pipelineLocked: false,
      pipelineStatus: "Imported",
      pipelineStatusUpdatedAt: Date.now(),
      pipelineError: undefined,
      pipelineErrorCode: undefined,
      finalizedAt: undefined,
      finalizedBy: undefined,
    });

    const now = Date.now();
    const jobId = await ctx.db.insert("importProcessingJobs", {
      importId: args.importId,
      status: "running",
      progressMessage: "Reprocessing import…",
      forceReprocess: true,
      retryCount: 0,
      startedBy: user._id,
      startedByName: getDisplayName(user),
      startedAt: now,
      lastProgressAt: now,
    });

    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userName: getDisplayName(user),
      action: "import_reprocess",
      entityType: "thirdPartyImport",
      entityId: args.importId,
      details: JSON.stringify({
        reason: args.reason ?? "Admin requested full reprocess",
      }),
    });

    await ctx.scheduler.runAfter(0, internal.importProcessingActions.runProcessingStep, {
      jobId,
    });

    return { jobId };
  },
});

export const getProcessingContext = internalQuery({
  args: { jobId: v.id("importProcessingJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return null;
    }
    const imp = await ctx.db.get(job.importId);
    if (!imp) {
      return null;
    }
    return { job, imp };
  },
});

export const markJobProgress = internalMutation({
  args: {
    jobId: v.id("importProcessingJobs"),
    currentStep: v.optional(v.string()),
    progressMessage: v.string(),
    progressCurrent: v.optional(v.number()),
    progressTotal: v.optional(v.number()),
    pipelineStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      currentStep: args.currentStep,
      progressMessage: args.progressMessage,
      progressCurrent: args.progressCurrent,
      progressTotal: args.progressTotal,
      lastProgressAt: now,
    });

    if (args.pipelineStatus) {
      await ctx.db.patch(job.importId, {
        pipelineStatus: args.pipelineStatus,
        pipelineStatusUpdatedAt: now,
      });
    }
  },
});

export const completeJob = internalMutation({
  args: {
    jobId: v.id("importProcessingJobs"),
    status: v.union(
      v.literal("completed"),
      v.literal("failed"),
      v.literal("waiting"),
      v.literal("running"),
    ),
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    pipelineStatus: v.optional(v.string()),
    resumeAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return;
    }

    const now = Date.now();
    const jobPatch: Record<string, unknown> = {
      status: args.status,
      lastProgressAt: now,
      errorMessage: args.errorMessage,
      errorCode: args.errorCode,
      resumeAt: args.resumeAt,
      progressMessage:
        args.errorMessage ??
        (args.status === "completed" ? "Import processing complete." : job.progressMessage),
    };
    if (args.status !== "running") {
      jobPatch.completedAt = now;
    }
    await ctx.db.patch(args.jobId, jobPatch);

    const importPatch: Record<string, unknown> = {
      pipelineStatusUpdatedAt: now,
    };
    if (args.pipelineStatus) {
      importPatch.pipelineStatus = args.pipelineStatus;
    }
    if (args.errorMessage) {
      importPatch.pipelineError = args.errorMessage;
      importPatch.pipelineErrorCode = args.errorCode;
    }
    if (args.status === "completed" && args.pipelineStatus === "Finalized") {
      importPatch.finalizedAt = now;
      importPatch.finalizedBy = job.startedBy;
      importPatch.pipelineLocked = true;
      importPatch.dataFullyCached = true;
      importPatch.pipelineError = undefined;
      importPatch.pipelineErrorCode = undefined;
    }

    await ctx.db.patch(job.importId, importPatch);

    if (args.status === "completed" && args.pipelineStatus === "Finalized") {
      await refreshEventCacheForImport(ctx, job.importId);
    }
  },
});

export const runMatchPlayersStep = internalMutation({
  args: { jobId: v.id("importProcessingJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }
    const counts = await rematchImportInternal(ctx, job.importId);
    const imp = await ctx.db.get(job.importId);
    if (!imp) {
      throw new Error("Import not found");
    }
    return {
      ...counts,
      pipelineStatus: postStepStatus(imp, "match_players"),
    };
  },
});

export const runLinkEventStep = internalMutation({
  args: { jobId: v.id("importProcessingJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }
    const result = await tryAutoLinkImport(ctx, job.importId);
    const imp = await ctx.db.get(job.importId);
    if (!imp) {
      throw new Error("Import not found");
    }
    return {
      ...result,
      pipelineStatus: postStepStatus(imp, "link_event"),
    };
  },
});

export const runValidateResultsStep = internalMutation({
  args: { jobId: v.id("importProcessingJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }
    const imp = await ctx.db.get(job.importId);
    if (!imp) {
      throw new Error("Import not found");
    }
    return validateImportResults(ctx, imp);
  },
});

export const scheduleProcessingStep = internalMutation({
  args: {
    jobId: v.id("importProcessingJobs"),
    delayMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      args.delayMs ?? 0,
      internal.importProcessingActions.runProcessingStep,
      { jobId: args.jobId },
    );
  },
});

export const incrementJobRetry = internalMutation({
  args: { jobId: v.id("importProcessingJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return { retryCount: 0 };
    }
    const retryCount = job.retryCount + 1;
    await ctx.db.patch(args.jobId, { retryCount });
    return { retryCount };
  },
});

export const setJobResumeAt = internalMutation({
  args: {
    jobId: v.id("importProcessingJobs"),
    resumeAt: v.number(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return;
    }
    await ctx.db.patch(args.jobId, {
      status: "running",
      resumeAt: args.resumeAt,
      errorMessage: args.errorMessage,
      errorCode: "rate_limited",
      lastProgressAt: Date.now(),
    });
    await ctx.db.patch(job.importId, {
      pipelineStatus: "Rate Limited",
      pipelineStatusUpdatedAt: Date.now(),
      pipelineError: args.errorMessage,
      pipelineErrorCode: "rate_limited",
    });
  },
});

export const resolveNextProcessingStep = internalQuery({
  args: {
    importId: v.id("thirdPartyImports"),
    forceReprocess: v.boolean(),
  },
  handler: async (ctx, args) => {
    const imp = await ctx.db.get(args.importId);
    if (!imp) {
      return null;
    }
    return resolveNextStep(imp, args.forceReprocess);
  },
});

export const getStepProgressMessage = internalQuery({
  args: {
    step: v.string(),
    current: v.optional(v.number()),
    total: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    return progressMessageForStep(args.step as ImportPipelineStep, {
      current: args.current,
      total: args.total,
    });
  },
});
