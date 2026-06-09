import { ConvexError, v } from "convex/values";
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
import {
  countImportMatchStatus,
  rematchImportResults,
  rematchImportResultsBatch,
  collectAffectedPlayerIdsForImport,
} from "./lib/importRematch";
import {
  IMPORT_ROW_BATCH_SIZE,
  IMPORT_STATS_PLAYER_BATCH_SIZE,
  isApiPipelineStep,
  shouldWriteImportProgress,
  type ImportProgressWriteReason,
} from "./lib/importProcessingBatch";
import { logImportPipelineEvent } from "./lib/importPipelineLogging";
import { appendLeaderboardUrlToEvent } from "./lib/eventLeaderboardLinks";
import { updateStatsForPlayers } from "./lib/stats/updatePlayerStatsCache";
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
  retryDelayMsForRateLimit,
  statusForStep,
  type ImportPipelineStep,
} from "./lib/importPipeline";
import {
  collectImplicitlyCompletedSteps,
  importIsEligibleForBatchQueue,
  mergeCompletedSteps,
  resolveNextStepForImport,
} from "./lib/resolveImportPipelineStep";
async function loadJobContext(ctx: MutationCtx, jobId: Id<"importProcessingJobs">) {
  const job = await ctx.db.get(jobId);
  if (!job) {
    return null;
  }
  const imp = await ctx.db.get(job.importId);
  if (!imp) {
    return null;
  }
  return { job, imp };
}

const INITIAL_JOB_METRICS = {
  rowsProcessed: 0,
  batchesProcessed: 0,
  progressWrites: 0,
  contextReads: 0,
  completedSteps: [] as string[],
} as const;

async function patchJobMetrics(
  ctx: MutationCtx,
  jobId: Id<"importProcessingJobs">,
  patch: {
    contextReads?: number;
    batchesProcessed?: number;
    progressWrites?: number;
    rowsProcessed?: number;
  },
) {
  const job = await ctx.db.get(jobId);
  if (!job) {
    return;
  }
  await ctx.db.patch(jobId, {
    contextReads: (job.contextReads ?? 0) + (patch.contextReads ?? 0),
    batchesProcessed: (job.batchesProcessed ?? 0) + (patch.batchesProcessed ?? 0),
    progressWrites: (patch.progressWrites ?? 0) > 0
      ? (job.progressWrites ?? 0) + (patch.progressWrites ?? 0)
      : (job.progressWrites ?? 0),
    rowsProcessed:
      patch.rowsProcessed != null
        ? (job.rowsProcessed ?? 0) + patch.rowsProcessed
        : (job.rowsProcessed ?? 0),
  });
}

async function snapshotJobMetricsOnTerminal(
  ctx: MutationCtx,
  jobId: Id<"importProcessingJobs">,
  terminalStatus: "failed" | "cancelled" | "waiting",
  message?: string,
) {
  const job = await ctx.db.get(jobId);
  if (!job) {
    return;
  }

  await ctx.db.patch(jobId, {
    rowsProcessed: job.rowsProcessed ?? 0,
    batchesProcessed: job.batchesProcessed ?? 0,
    progressWrites: job.progressWrites ?? 0,
    contextReads: job.contextReads ?? 0,
    completedSteps: job.completedSteps ?? [],
    progressMessage: message ?? job.progressMessage,
  });

  console.log(
    `[importProcessing] job ${jobId} ${terminalStatus}: rowsProcessed=${job.rowsProcessed ?? 0} batchesProcessed=${job.batchesProcessed ?? 0} progressWrites=${job.progressWrites ?? 0} contextReads=${job.contextReads ?? 0} completedSteps=${(job.completedSteps ?? []).join(",")}`,
  );
}

async function maybeWriteJobProgress(
  ctx: MutationCtx,
  args: {
    jobId: Id<"importProcessingJobs">;
    importId: Id<"thirdPartyImports">;
    step: ImportPipelineStep;
    progressMessage: string;
    progressCurrent?: number;
    progressTotal?: number;
    pipelineStatus?: string;
    lastProgressWriteRow: number;
    reason: ImportProgressWriteReason;
  },
): Promise<number> {
  const current = args.progressCurrent ?? 0;
  const total = args.progressTotal ?? 0;
  if (
    !shouldWriteImportProgress({
      current,
      total,
      lastWriteRow: args.lastProgressWriteRow,
      reason: args.reason,
    })
  ) {
    return args.lastProgressWriteRow;
  }

  const now = Date.now();
  await ctx.db.patch(args.jobId, {
    currentStep: args.step,
    progressMessage: args.progressMessage,
    progressCurrent: args.progressCurrent,
    progressTotal: args.progressTotal,
    lastProgressAt: now,
    lastProgressWriteRow: current,
  });

  if (args.pipelineStatus) {
    await ctx.db.patch(args.importId, {
      pipelineStatus: args.pipelineStatus,
      pipelineStatusUpdatedAt: now,
    });
  }

  await patchJobMetrics(ctx, args.jobId, { progressWrites: 1 });
  return current;
}

async function schedulePipelineContinuation(
  ctx: MutationCtx,
  jobId: Id<"importProcessingJobs">,
  nextStep: ImportPipelineStep | null,
  delayMs = 0,
) {
  if (nextStep && isApiPipelineStep(nextStep)) {
    await ctx.scheduler.runAfter(
      delayMs,
      internal.importProcessingActions.runProcessingStep,
      { jobId },
    );
    return;
  }

  await ctx.scheduler.runAfter(delayMs, internal.importProcessing.processImportBatch, {
    jobId,
  });
}

async function completePipelineStepAndContinue(
  ctx: MutationCtx,
  jobId: Id<"importProcessingJobs">,
  completedStep: ImportPipelineStep,
) {
  const context = await loadJobContext(ctx, jobId);
  if (!context || context.job.status !== "running") {
    logImportPipelineEvent({
      importId: context?.job.importId,
      jobId,
      step: completedStep,
      message: "step_continue_aborted_job_not_running",
    });
    return;
  }

  const { job, imp } = context;
  const priorSteps = job.completedSteps ?? [];

  if (priorSteps.includes(completedStep)) {
    logImportPipelineEvent({
      importId: job.importId,
      jobId,
      step: completedStep,
      message: "step_already_completed_resuming_pipeline",
    });
  }

  const implicitSteps = await collectImplicitlyCompletedSteps(
    ctx,
    imp,
    job.forceReprocess,
    priorSteps,
  );
  const completedSteps = mergeCompletedSteps(
    priorSteps,
    ...implicitSteps,
    ...(priorSteps.includes(completedStep) ? [] : [completedStep]),
  );
  const pipelineStatus = postStepStatus(imp, completedStep);

  await ctx.db.patch(jobId, {
    completedSteps,
    stepRowCursor: undefined,
    statsPlayerCursor: undefined,
    lastProgressWriteRow: undefined,
    currentStep: undefined,
    progressCurrent: undefined,
    progressTotal: undefined,
  });

  if (!priorSteps.includes(completedStep)) {
    await ctx.db.patch(job.importId, {
      pipelineStatus,
      pipelineStatusUpdatedAt: Date.now(),
    });
  }

  const nextStep = await resolveNextStepForImport(
    ctx,
    { ...imp, pipelineStatus },
    job.forceReprocess,
    completedSteps,
  );

  if (!nextStep) {
    const finalizePending =
      !completedSteps.includes("finalize") && imp.pipelineStatus !== "Finalized";
    if (finalizePending) {
      await schedulePipelineContinuation(ctx, jobId, "finalize");
      return;
    }
    await finalizeImportJob(ctx, {
      jobId,
      status: "completed",
      pipelineStatus: "Finalized",
    });
    return;
  }

  const delayMs = completedStep === "sync_match_data" ? 1000 : 0;
  await schedulePipelineContinuation(ctx, jobId, nextStep, delayMs);
}

type FinalizeJobArgs = {
  jobId: Id<"importProcessingJobs">;
  status: "completed" | "failed" | "waiting" | "running";
  errorMessage?: string;
  errorCode?: string;
  pipelineStatus?: string;
  resumeAt?: number;
};

async function finalizeImportJob(ctx: MutationCtx, args: FinalizeJobArgs) {
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
    rowsProcessed: job.rowsProcessed ?? 0,
    batchesProcessed: job.batchesProcessed ?? 0,
    progressWrites: job.progressWrites ?? 0,
    contextReads: job.contextReads ?? 0,
    completedSteps: job.completedSteps ?? [],
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
    await ctx.scheduler.runAfter(0, internal.importProcessing.refreshEventCacheForImportJob, {
      importId: job.importId,
    });
  }

  if (args.status === "completed" || args.status === "failed" || args.status === "waiting") {
    const affectedCount = job.affectedPlayerIds?.length ?? 0;
    console.log(
      `[importProcessing] job ${args.jobId} ${args.status}: rowsProcessed=${job.rowsProcessed ?? 0} affectedPlayers=${affectedCount} playersUpdated=${job.playersUpdated ?? 0} skippedNoChange=${job.skippedNoChange ?? 0} batchesProcessed=${job.batchesProcessed ?? 0} progressWrites=${job.progressWrites ?? 0} contextReads=${job.contextReads ?? 0} completedSteps=${(job.completedSteps ?? []).join(",")} errors=${(job.errors ?? []).length}`,
    );
  }
}

export const refreshEventCacheForImportJob = internalMutation({
  args: { importId: v.id("thirdPartyImports") },
  handler: async (ctx, args) => {
    await refreshEventCacheForImport(ctx, args.importId);
  },
});

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

  return await rematchImportResults(ctx, importId);
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

export const listImportsNeedingProcessing = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const allImports = await ctx.db.query("thirdPartyImports").order("desc").collect();
    const imports: Array<{
      _id: Id<"thirdPartyImports">;
      eventName: string;
      pipelineStatus?: string;
      nextStep: ImportPipelineStep;
    }> = [];
    let alreadyComplete = 0;

    for (const imp of allImports) {
      if (!importIsEligibleForBatchQueue(imp)) {
        continue;
      }

      const running = await ctx.db
        .query("importProcessingJobs")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .filter((q) => q.eq(q.field("status"), "running"))
        .first();
      if (running) {
        continue;
      }

      const nextStep = await resolveNextStepForImport(ctx, imp, false);
      if (nextStep === null) {
        alreadyComplete += 1;
        continue;
      }

      imports.push({
        _id: imp._id,
        eventName: imp.eventName,
        pipelineStatus: imp.pipelineStatus,
        nextStep,
      });
    }

    return { imports, alreadyComplete };
  },
});

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
      ...INITIAL_JOB_METRICS,
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

/** Internal entry point for pipeline kick-off (no auth — scheduler/ops only). */
export const startProcessImportInternal = internalMutation({
  args: {
    importId: v.id("thirdPartyImports"),
    forceReprocess: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const imp = await ctx.db.get(args.importId);
    if (!imp) {
      throw new Error("Import not found");
    }
    if (imp.pipelineStatus === "Ignored") {
      throw new Error("This import is marked as ignored.");
    }
    if (isImportFinalized(imp) && imp.pipelineLocked && !args.forceReprocess) {
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
    const forceReprocess = args.forceReprocess ?? false;
    const jobId = await ctx.db.insert("importProcessingJobs", {
      importId: args.importId,
      status: "running",
      progressMessage: forceReprocess ? "Reprocessing import…" : "Starting Process Import…",
      forceReprocess,
      retryCount: 0,
      startedAt: now,
      lastProgressAt: now,
      ...INITIAL_JOB_METRICS,
    });

    if (forceReprocess) {
      await ctx.db.patch(args.importId, {
        pipelineLocked: false,
        pipelineStatus: "Imported",
        pipelineStatusUpdatedAt: now,
        pipelineError: undefined,
        pipelineErrorCode: undefined,
        finalizedAt: undefined,
        finalizedBy: undefined,
      });
    } else {
      await ctx.db.patch(args.importId, {
        pipelineStatus: imp.pipelineStatus ?? "Imported",
        pipelineStatusUpdatedAt: now,
        pipelineError: undefined,
        pipelineErrorCode: undefined,
      });
    }

    await ctx.scheduler.runAfter(0, internal.importProcessingActions.runProcessingStep, {
      jobId,
    });

    return { jobId };
  },
});

export const cancelRunningImportJob = mutation({
  args: {
    importId: v.id("thirdPartyImports"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (!args.importId) {
      throw new ConvexError({
        message: "importId is required to cancel a running import job.",
        code: "INVALID_ARGUMENT",
      });
    }

    const running = await ctx.db
      .query("importProcessingJobs")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .filter((q) => q.eq(q.field("status"), "running"))
      .first();
    if (!running) {
      return {
        cancelled: false,
        message: "No running import job found for this import.",
      };
    }

    const cancelMessage = args.reason ?? "Cancelled by admin.";
    await ctx.db.patch(running._id, {
      status: "cancelled",
      completedAt: Date.now(),
      lastProgressAt: Date.now(),
      progressMessage: cancelMessage,
    });
    await snapshotJobMetricsOnTerminal(ctx, running._id, "cancelled", cancelMessage);

    return { cancelled: true, jobId: running._id, message: "Import processing cancelled." };
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
      ...INITIAL_JOB_METRICS,
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
    await finalizeImportJob(ctx, args);
  },
});

export const completeApiPipelineStep = internalMutation({
  args: {
    jobId: v.id("importProcessingJobs"),
    completedStep: v.string(),
  },
  handler: async (ctx, args) => {
    await completePipelineStepAndContinue(
      ctx,
      args.jobId,
      args.completedStep as ImportPipelineStep,
    );
  },
});

export const processImportBatch = internalMutation({
  args: { jobId: v.id("importProcessingJobs") },
  handler: async (ctx, args) => {
    const batchStart = Date.now();
    const context = await loadJobContext(ctx, args.jobId);
    if (!context || context.job.status !== "running") {
      return { done: true, reason: "job_not_running" as const };
    }

    let { job, imp } = context;
    const batchNumber = (job.batchesProcessed ?? 0) + 1;
    await patchJobMetrics(ctx, args.jobId, { contextReads: 1, batchesProcessed: 1 });

    if (job.resumeAt && Date.now() < job.resumeAt) {
      const delay = job.resumeAt - Date.now();
      await ctx.scheduler.runAfter(delay, internal.importProcessingActions.runProcessingStep, {
        jobId: args.jobId,
      });
      return { waiting: true, reason: "resume_scheduled" as const };
    }

    const step = await resolveNextStepForImport(
      ctx,
      imp,
      job.forceReprocess,
      job.completedSteps ?? [],
    );

    if (!step) {
      const completed = new Set(job.completedSteps ?? []);
      const finalizePending =
        !completed.has("finalize") && imp.pipelineStatus !== "Finalized";
      if (finalizePending) {
        await schedulePipelineContinuation(ctx, args.jobId, "finalize");
        return { continuing: true, reason: "finalizing" as const };
      }
      await finalizeImportJob(ctx, {
        jobId: args.jobId,
        status: "completed",
        pipelineStatus: "Finalized",
      });
      return { done: true, reason: "no_steps_remaining" as const };
    }

    if (isApiPipelineStep(step)) {
      await ctx.scheduler.runAfter(0, internal.importProcessingActions.runProcessingStep, {
        jobId: args.jobId,
      });
      return { delegated: true, step };
    }

    const enteringStep = job.currentStep !== step;
    let lastProgressWriteRow = job.lastProgressWriteRow ?? 0;

    if (enteringStep) {
      lastProgressWriteRow = await maybeWriteJobProgress(ctx, {
        jobId: args.jobId,
        importId: job.importId,
        step,
        progressMessage: progressMessageForStep(step),
        pipelineStatus: statusForStep(step),
        lastProgressWriteRow,
        reason: "step_start",
      });
    }

    try {
    switch (step) {
      case "match_players": {
        const startIndex = job.stepRowCursor ?? 0;
        const batch = await rematchImportResultsBatch(
          ctx,
          job.importId,
          startIndex,
          IMPORT_ROW_BATCH_SIZE,
          job.affectedPlayerIds ?? [],
        );

        await ctx.db.patch(args.jobId, {
          currentStep: step,
          stepRowCursor: batch.nextRowIndex,
          affectedPlayerIds: batch.affectedPlayerIds,
          skippedNoChange: (job.skippedNoChange ?? 0) + batch.skippedNoChange,
        });

        lastProgressWriteRow = await maybeWriteJobProgress(ctx, {
          jobId: args.jobId,
          importId: job.importId,
          step,
          progressMessage: progressMessageForStep(step, {
            current: batch.nextRowIndex,
            total: batch.totalRows,
          }),
          progressCurrent: batch.nextRowIndex,
          progressTotal: batch.totalRows,
          lastProgressWriteRow,
          reason: batch.done ? "step_complete" : "interval",
        });

        await patchJobMetrics(ctx, args.jobId, {
          rowsProcessed: batch.batchRowsProcessed,
        });

        logImportPipelineEvent({
          importId: job.importId,
          jobId: args.jobId,
          step,
          batchNumber,
          rowsInBatch: batch.batchRowsProcessed,
          elapsedMs: Date.now() - batchStart,
          message: batch.done ? "match_players_batch_done" : "match_players_batch",
        });

        if (!batch.done) {
          await ctx.scheduler.runAfter(0, internal.importProcessing.processImportBatch, {
            jobId: args.jobId,
          });
          return {
            continuing: true,
            step,
            rowsProcessed: batch.batchRowsProcessed,
          };
        }

        const counts = await countImportMatchStatus(ctx, job.importId);
        await ctx.db.patch(job.importId, {
          playersMatched: counts.playersMatched,
          playersUnmatched: counts.playersUnmatched,
        });

        if (counts.playersUnmatched > 0) {
          await finalizeImportJob(ctx, {
            jobId: args.jobId,
            status: "waiting",
            pipelineStatus: "Player Matching Required",
            errorMessage: `${counts.playersUnmatched} players could not be matched. Review unmatched players, then run Process Import again.`,
            errorCode: "unmatched_players",
          });
          return { waiting: true, reason: "unmatched_players" as const };
        }

        await completePipelineStepAndContinue(ctx, args.jobId, step);
        return { completedStep: step };
      }

      case "link_event": {
        const linkResult = await tryAutoLinkImport(ctx, job.importId);
        imp = (await ctx.db.get(job.importId))!;

        if (!linkResult.linked) {
          if (linkResult.reason === "ambiguous") {
            await finalizeImportJob(ctx, {
              jobId: args.jobId,
              status: "waiting",
              pipelineStatus: "Event Link Required",
              errorMessage: `Event link failed because multiple events matched this import (${linkResult.candidateCount}). Link the event manually.`,
              errorCode: "event_link_ambiguous",
            });
            return { waiting: true, reason: "event_link_ambiguous" as const };
          }
          await finalizeImportJob(ctx, {
            jobId: args.jobId,
            status: "waiting",
            pipelineStatus: "Event Link Required",
            errorMessage:
              "No matching event was found for this import. Link the event manually, then run Process Import again.",
            errorCode: "event_link_missing",
          });
          return { waiting: true, reason: "event_link_missing" as const };
        }

        await maybeWriteJobProgress(ctx, {
          jobId: args.jobId,
          importId: job.importId,
          step,
          progressMessage: progressMessageForStep(step),
          lastProgressWriteRow,
          reason: "step_complete",
        });
        await completePipelineStepAndContinue(ctx, args.jobId, step);
        return { completedStep: step };
      }

      case "validate_results": {
        const validation = await validateImportResults(ctx, imp);
        if (!validation.valid) {
          const isWaiting =
            validation.code === "unmatched_players" ||
            validation.code === "event_link_missing";
          await maybeWriteJobProgress(ctx, {
            jobId: args.jobId,
            importId: job.importId,
            step,
            progressMessage: validation.reason,
            pipelineStatus: isWaiting ? statusForStep(step) : "Failed",
            lastProgressWriteRow,
            reason: "error",
          });
          await finalizeImportJob(ctx, {
            jobId: args.jobId,
            status: isWaiting ? "waiting" : "failed",
            pipelineStatus:
              validation.code === "event_link_missing"
                ? "Event Link Required"
                : validation.code === "unmatched_players"
                  ? "Player Matching Required"
                  : "Failed",
            errorMessage: validation.reason,
            errorCode: validation.code ?? "validation_failed",
          });
          return { done: !isWaiting, waiting: isWaiting };
        }

        await maybeWriteJobProgress(ctx, {
          jobId: args.jobId,
          importId: job.importId,
          step,
          progressMessage: progressMessageForStep(step),
          lastProgressWriteRow,
          reason: "step_complete",
        });
        await completePipelineStepAndContinue(ctx, args.jobId, step);
        return { completedStep: step };
      }

      case "update_player_stats": {
        let playerIds = job.affectedPlayerIds;
        if (!playerIds || playerIds.length === 0) {
          playerIds = await collectAffectedPlayerIdsForImport(ctx, job.importId);
          await ctx.db.patch(args.jobId, { affectedPlayerIds: playerIds });
        }

        const startIndex = job.statsPlayerCursor ?? 0;
        const endIndex = Math.min(
          startIndex + IMPORT_STATS_PLAYER_BATCH_SIZE,
          playerIds.length,
        );
        const batchPlayerIds = playerIds.slice(startIndex, endIndex);

        const summary = await updateStatsForPlayers(ctx, batchPlayerIds);

        const done = endIndex >= playerIds.length;
        await ctx.db.patch(args.jobId, {
          currentStep: step,
          statsPlayerCursor: endIndex,
          playersUpdated: (job.playersUpdated ?? 0) + summary.playersUpdated,
          skippedNoChange: (job.skippedNoChange ?? 0) + summary.skippedNoChange,
          errors: [...(job.errors ?? []), ...summary.errors],
        });

        lastProgressWriteRow = await maybeWriteJobProgress(ctx, {
          jobId: args.jobId,
          importId: job.importId,
          step,
          progressMessage: progressMessageForStep(step, {
            current: endIndex,
            total: playerIds.length,
          }),
          progressCurrent: endIndex,
          progressTotal: playerIds.length,
          lastProgressWriteRow,
          reason: done ? "step_complete" : "interval",
        });

        logImportPipelineEvent({
          importId: job.importId,
          jobId: args.jobId,
          step,
          batchNumber,
          rowsInBatch: batchPlayerIds.length,
          elapsedMs: Date.now() - batchStart,
          message: done ? "update_player_stats_batch_done" : "update_player_stats_batch",
        });

        if (!done) {
          await ctx.scheduler.runAfter(0, internal.importProcessing.processImportBatch, {
            jobId: args.jobId,
          });
          return {
            continuing: true,
            step,
            playersProcessed: batchPlayerIds.length,
          };
        }

        if (playerIds.length > 0) {
          await ctx.scheduler.runAfter(
            0,
            internal.memberManagement.markPlayersRecentlyActiveInternal,
            { playerIds },
          );
        }

        await completePipelineStepAndContinue(ctx, args.jobId, step);
        return { completedStep: step };
      }

      case "sync_match_data":
      case "populate_team_members":
        throw new Error(`${step} is handled by importProcessingActions, not processImportBatch`);

      case "finalize": {
        await maybeWriteJobProgress(ctx, {
          jobId: args.jobId,
          importId: job.importId,
          step,
          progressMessage: progressMessageForStep(step),
          pipelineStatus: "Finalized",
          lastProgressWriteRow,
          reason: "step_complete",
        });
        await finalizeImportJob(ctx, {
          jobId: args.jobId,
          status: "completed",
          pipelineStatus: "Finalized",
        });
        const finalizePrior = job.completedSteps ?? [];
        await ctx.db.patch(args.jobId, {
          completedSteps: finalizePrior.includes(step)
            ? finalizePrior
            : [...finalizePrior, step],
        });
        return { done: true, finalized: true };
      }

      default: {
        const exhaustiveCheck: never = step;
        throw new Error(`Unhandled pipeline step in batch processor: ${exhaustiveCheck}`);
      }
    }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      logImportPipelineEvent({
        importId: job.importId,
        jobId: args.jobId,
        step: job.currentStep ?? step,
        batchNumber,
        elapsedMs: Date.now() - batchStart,
        error: rawMessage,
        message: "batch_step_failed",
      });
      try {
        await finalizeImportJob(ctx, {
          jobId: args.jobId,
          status: "failed",
          pipelineStatus: "Failed",
          errorMessage: rawMessage,
          errorCode: "batch_processing_error",
        });
      } catch (finalizeError) {
        const finalizeMessage =
          finalizeError instanceof Error ? finalizeError.message : String(finalizeError);
        await ctx.db.patch(args.jobId, {
          status: "failed",
          completedAt: Date.now(),
          lastProgressAt: Date.now(),
          errorMessage: `${rawMessage} (finalize: ${finalizeMessage})`,
          errorCode: "batch_processing_error",
          progressMessage: rawMessage,
        });
        await ctx.db.patch(job.importId, {
          pipelineStatus: "Failed",
          pipelineStatusUpdatedAt: Date.now(),
          pipelineError: rawMessage,
          pipelineErrorCode: "batch_processing_error",
        });
      }
      return { failed: true, error: rawMessage };
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
    await ctx.db.patch(args.jobId, {
      affectedPlayerIds: counts.affectedPlayerIds,
      rowsProcessed: counts.rowsProcessed,
      skippedNoChange: counts.skippedNoChange,
    });
    const imp = await ctx.db.get(job.importId);
    if (!imp) {
      throw new Error("Import not found");
    }
    return {
      playersMatched: counts.playersMatched,
      playersUnmatched: counts.playersUnmatched,
      pipelineStatus: postStepStatus(imp, "match_players"),
    };
  },
});

export const runUpdatePlayerStatsStep = internalMutation({
  args: { jobId: v.id("importProcessingJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    const playerIds =
      job.affectedPlayerIds && job.affectedPlayerIds.length > 0
        ? job.affectedPlayerIds
        : await collectAffectedPlayerIdsForImport(ctx, job.importId);

    const summary = await updateStatsForPlayers(ctx, playerIds);

    let tierEvalUpdated = 0;
    for (const playerId of playerIds) {
      const cacheRow = await ctx.db
        .query("playerStatsCache")
        .withIndex("by_player", (q) => q.eq("playerId", playerId))
        .first();
      if (cacheRow?.reevaluationEligible) {
        const medians = await ctx.db.query("tierMediansCache").first();
        if (medians) {
          await ctx.runMutation(internal.tierReEvaluationBatched.processBatch, {
            batchNumber: 0,
            playerIds: [playerId],
          });
          tierEvalUpdated += 1;
        }
      } else {
        const existing = await ctx.db
          .query("tierReEvaluationCache")
          .withIndex("by_player", (q) => q.eq("playerId", playerId))
          .first();
        if (existing) {
          await ctx.db.delete(existing._id);
        }
      }
    }

    await ctx.db.patch(args.jobId, {
      affectedPlayerIds: playerIds,
      playersUpdated: summary.playersUpdated,
      skippedNoChange: summary.skippedNoChange,
      errors: summary.errors,
      progressCurrent: playerIds.length,
      progressTotal: playerIds.length,
    });

    if (playerIds.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.memberManagement.markPlayersRecentlyActiveInternal,
        { playerIds },
      );
    }

    const imp = await ctx.db.get(job.importId);
    if (!imp) {
      throw new Error("Import not found");
    }

    return {
      ...summary,
      tierEvalUpdated,
      affectedPlayers: playerIds.length,
      pipelineStatus: postStepStatus(imp, "update_player_stats"),
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
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return;
    }

    const imp = await ctx.db.get(job.importId);
    if (!imp) {
      return;
    }

    const nextStep = await resolveNextStepForImport(
      ctx,
      imp,
      job.forceReprocess,
      job.completedSteps ?? [],
    );

    await schedulePipelineContinuation(ctx, args.jobId, nextStep, args.delayMs ?? 0);
  },
});

export const incrementJobMetric = internalMutation({
  args: {
    jobId: v.id("importProcessingJobs"),
    contextReads: v.optional(v.number()),
    batchesProcessed: v.optional(v.number()),
    progressWrites: v.optional(v.number()),
    rowsProcessed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await patchJobMetrics(ctx, args.jobId, {
      contextReads: args.contextReads,
      batchesProcessed: args.batchesProcessed,
      progressWrites: args.progressWrites,
      rowsProcessed: args.rowsProcessed,
    });
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
    completedSteps: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const imp = await ctx.db.get(args.importId);
    if (!imp) {
      return null;
    }
    return resolveNextStepForImport(
      ctx,
      imp,
      args.forceReprocess,
      args.completedSteps ?? [],
    );
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
