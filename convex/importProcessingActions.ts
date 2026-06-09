"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { isApiPipelineStep, MAX_PIPELINE_RETRIES } from "./lib/importProcessingBatch";
import {
  isTransientYuniteError,
  progressMessageForStep,
  retryDelayMsForRateLimit,
  sanitizePipelineErrorMessage,
  statusForStep,
  type ImportPipelineStep,
} from "./lib/importPipeline";
import { logImportPipelineEvent } from "./lib/importPipelineLogging";

type ProcessingStepResult = {
  done?: boolean;
  waiting?: boolean;
  retrying?: boolean;
  failed?: boolean;
  finalized?: boolean;
  delegated?: boolean;
  reason?: string;
  error?: string;
  delayMs?: number;
  completedStep?: string;
};

export const runProcessingStep = internalAction({
  args: { jobId: v.id("importProcessingJobs") },
  handler: async (ctx, args): Promise<ProcessingStepResult> => {
    const context = await ctx.runQuery(
      internal.importProcessing.getProcessingContextWithNextStep,
      { jobId: args.jobId },
    );

    if (!context || context.job.status !== "running") {
      return { done: true, reason: "job_not_running" };
    }

    const { job, step } = context;

    if (job.resumeAt && Date.now() < job.resumeAt) {
      const delay = job.resumeAt - Date.now();
      await ctx.runMutation(internal.importProcessing.scheduleProcessingStep, {
        jobId: args.jobId,
        delayMs: delay,
      });
      return { waiting: true, reason: "resume_scheduled" };
    }

    if (!step) {
      const completed = new Set(context.job.completedSteps ?? []);
      if (!completed.has("finalize") && context.imp.pipelineStatus !== "Finalized") {
        await ctx.scheduler.runAfter(0, internal.importProcessing.processImportBatch, {
          jobId: args.jobId,
        });
        return { delegated: true, reason: "finalize_step_scheduled" };
      }
      await ctx.runMutation(internal.importProcessing.completeJob, {
        jobId: args.jobId,
        status: "completed",
        pipelineStatus: "Finalized",
      });
      return { done: true, reason: "no_steps_remaining" };
    }

    if (!isApiPipelineStep(step)) {
      await ctx.scheduler.runAfter(0, internal.importProcessing.processImportBatch, {
        jobId: args.jobId,
      });
      return { delegated: true, reason: "batch_step_scheduled" };
    }

    await ctx.runMutation(internal.importProcessing.incrementJobMetric, {
      jobId: args.jobId,
      contextReads: 1,
    });

    const pipelineStep = step as ImportPipelineStep;
    const enteringStep = job.currentStep !== pipelineStep;
    if (enteringStep) {
      await ctx.runMutation(internal.importProcessing.markJobProgress, {
        jobId: args.jobId,
        currentStep: pipelineStep,
        progressMessage: progressMessageForStep(pipelineStep),
        pipelineStatus: statusForStep(pipelineStep),
      });
      await ctx.runMutation(internal.importProcessing.incrementJobMetric, {
        jobId: args.jobId,
        progressWrites: 1,
      });
    }

    try {
      switch (pipelineStep) {
        case "sync_match_data": {
          await ctx.runAction(internal.yunite.sync.syncTournamentMatchDataInternal, {
            importId: job.importId,
            jobId: args.jobId,
          });
          break;
        }
        case "populate_team_members": {
          await ctx.runAction(internal.yunite.populateTeamMembers.populateForImportInternal, {
            importId: job.importId,
            jobId: args.jobId,
          });
          break;
        }
        default:
          throw new Error(`Unexpected API pipeline step: ${pipelineStep}`);
      }

      await ctx.runMutation(internal.importProcessing.completeApiPipelineStep, {
        jobId: args.jobId,
        completedStep: pipelineStep,
      });

      return { done: false, completedStep: pipelineStep };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = sanitizePipelineErrorMessage(rawMessage);
      const elapsedMs =
        error instanceof Error && "elapsedMs" in error
          ? Number((error as Error & { elapsedMs?: number }).elapsedMs)
          : undefined;

      logImportPipelineEvent({
        importId: job.importId,
        jobId: args.jobId,
        step: pipelineStep,
        elapsedMs,
        error: message,
        message: "api_step_failed",
      });

      await ctx.runMutation(internal.importProcessing.markJobProgress, {
        jobId: args.jobId,
        currentStep: pipelineStep,
        progressMessage: message,
      });
      await ctx.runMutation(internal.importProcessing.incrementJobMetric, {
        jobId: args.jobId,
        progressWrites: 1,
      });

      if (isTransientYuniteError(rawMessage)) {
        const { retryCount } = await ctx.runMutation(
          internal.importProcessing.incrementJobRetry,
          { jobId: args.jobId },
        );

        if (retryCount >= MAX_PIPELINE_RETRIES) {
          const maxRetryMessage = `${message} (gave up after ${retryCount} retries)`;
          await ctx.runMutation(internal.importProcessing.completeJob, {
            jobId: args.jobId,
            status: "failed",
            pipelineStatus: "Failed",
            errorMessage: maxRetryMessage,
            errorCode: "max_retries_exceeded",
          });
          return { failed: true, error: maxRetryMessage };
        }

        const delayMs = retryDelayMsForRateLimit(retryCount);
        const resumeAt = Date.now() + delayMs;

        logImportPipelineEvent({
          importId: job.importId,
          jobId: args.jobId,
          step: pipelineStep,
          batchNumber: retryCount,
          error: message,
          message: "api_step_retry_scheduled",
        });

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
        errorCode:
          pipelineStep === "populate_team_members"
            ? "team_populate_error"
            : "yunite_api_error",
      });
      return { failed: true, error: message };
    }
  },
});
