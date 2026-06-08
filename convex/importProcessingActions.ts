"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  isRateLimitError,
  progressMessageForStep,
  retryDelayMsForRateLimit,
  statusForStep,
  type ImportPipelineStep,
} from "./lib/importPipeline";

type ProcessingStepResult = {
  done?: boolean;
  waiting?: boolean;
  retrying?: boolean;
  failed?: boolean;
  finalized?: boolean;
  reason?: string;
  error?: string;
  delayMs?: number;
  completedStep?: string;
};

export const runProcessingStep = internalAction({
  args: { jobId: v.id("importProcessingJobs") },
  handler: async (ctx, args): Promise<ProcessingStepResult> => {
    const context = await ctx.runQuery(internal.importProcessing.getProcessingContext, {
      jobId: args.jobId,
    });

    if (!context || context.job.status !== "running") {
      return { done: true, reason: "job_not_running" };
    }

    const { job, imp: initialImp } = context;

    if (job.resumeAt && Date.now() < job.resumeAt) {
      const delay = job.resumeAt - Date.now();
      await ctx.runMutation(internal.importProcessing.scheduleProcessingStep, {
        jobId: args.jobId,
        delayMs: delay,
      });
      return { waiting: true, reason: "resume_scheduled" };
    }

    const step = await ctx.runQuery(internal.importProcessing.resolveNextProcessingStep, {
      importId: job.importId,
      forceReprocess: job.forceReprocess,
    });

    if (!step) {
      await ctx.runMutation(internal.importProcessing.completeJob, {
        jobId: args.jobId,
        status: "completed",
        pipelineStatus: initialImp.pipelineStatus === "Finalized" ? "Finalized" : "Results Generated",
      });
      return { done: true, reason: "no_steps_remaining" };
    }

    const pipelineStatus = statusForStep(step);
    await ctx.runMutation(internal.importProcessing.markJobProgress, {
      jobId: args.jobId,
      currentStep: step,
      progressMessage: progressMessageForStep(step),
      pipelineStatus,
    });

    try {
      switch (step as ImportPipelineStep) {
        case "sync_match_data": {
          await ctx.runAction(internal.yunite.sync.syncTournamentMatchDataInternal, {
            importId: job.importId,
          });
          break;
        }
        case "populate_team_members": {
          await ctx.runAction(internal.yunite.populateTeamMembers.populateForImportInternal, {
            importId: job.importId,
          });
          break;
        }
        case "match_players": {
          const matchResult = await ctx.runMutation(
            internal.importProcessing.runMatchPlayersStep,
            { jobId: args.jobId },
          );
          if (matchResult.playersUnmatched > 0) {
            await ctx.runMutation(internal.importProcessing.completeJob, {
              jobId: args.jobId,
              status: "waiting",
              pipelineStatus: "Player Matching Required",
              errorMessage: `${matchResult.playersUnmatched} players could not be matched. Review unmatched players, then run Process Import again.`,
              errorCode: "unmatched_players",
            });
            return { waiting: true, reason: "unmatched_players" };
          }
          break;
        }
        case "link_event": {
          const linkResult = await ctx.runMutation(
            internal.importProcessing.runLinkEventStep,
            { jobId: args.jobId },
          );
          if (!linkResult.linked) {
            if (linkResult.reason === "ambiguous") {
              await ctx.runMutation(internal.importProcessing.completeJob, {
                jobId: args.jobId,
                status: "waiting",
                pipelineStatus: "Event Link Required",
                errorMessage: `Event link failed because multiple events matched this import (${linkResult.candidateCount}). Link the event manually.`,
                errorCode: "event_link_ambiguous",
              });
              return { waiting: true, reason: "event_link_ambiguous" };
            }
            await ctx.runMutation(internal.importProcessing.completeJob, {
              jobId: args.jobId,
              status: "waiting",
              pipelineStatus: "Event Link Required",
              errorMessage:
                "No matching event was found for this import. Link the event manually, then run Process Import again.",
              errorCode: "event_link_missing",
            });
            return { waiting: true, reason: "event_link_missing" };
          }
          break;
        }
        case "validate_results": {
          const validation = await ctx.runMutation(
            internal.importProcessing.runValidateResultsStep,
            { jobId: args.jobId },
          );
          if (!validation.valid) {
            const isWaiting =
              validation.code === "unmatched_players" ||
              validation.code === "event_link_missing";
            await ctx.runMutation(internal.importProcessing.completeJob, {
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
          break;
        }
        case "finalize": {
          await ctx.runMutation(internal.importProcessing.completeJob, {
            jobId: args.jobId,
            status: "completed",
            pipelineStatus: "Finalized",
          });
          return { done: true, finalized: true };
        }
      }

      if (step !== "finalize") {
        await ctx.runMutation(internal.importProcessing.scheduleProcessingStep, {
          jobId: args.jobId,
          delayMs: step === "sync_match_data" ? 1000 : 0,
        });
      }
      return { done: false, completedStep: step };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (isRateLimitError(message)) {
        const { retryCount } = await ctx.runMutation(
          internal.importProcessing.incrementJobRetry,
          { jobId: args.jobId },
        );
        const delayMs = retryDelayMsForRateLimit(retryCount);
        const resumeAt = Date.now() + delayMs;

        await ctx.runMutation(internal.importProcessing.setJobResumeAt, {
          jobId: args.jobId,
          resumeAt,
          errorMessage: message,
        });

        await ctx.runMutation(internal.importProcessing.scheduleProcessingStep, {
          jobId: args.jobId,
          delayMs,
        });
        return { retrying: true, delayMs };
      }

      await ctx.runMutation(internal.importProcessing.completeJob, {
        jobId: args.jobId,
        status: "failed",
        pipelineStatus: "Failed",
        errorMessage: message,
        errorCode: "yunite_api_error",
      });
      return { failed: true, error: message };
    }
  },
});
