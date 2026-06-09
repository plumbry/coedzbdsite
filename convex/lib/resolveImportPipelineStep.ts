import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import {
  isYuniteSource,
  pipelineStepsForImport,
  shouldSkipStep,
  type ImportPipelineStep,
} from "./importPipeline";

/** True when every result row already has teamMembers populated. */
export async function importHasTeamMembersPopulated(
  ctx: QueryCtx,
  importId: Id<"thirdPartyImports">,
): Promise<boolean> {
  const results = await ctx.db
    .query("thirdPartyResults")
    .withIndex("by_import", (q) => q.eq("importId", importId))
    .collect();

  if (results.length === 0) {
    return true;
  }

  return results.every((result) => (result.teamMembers?.length ?? 0) > 0);
}

export async function isStepEligible(
  ctx: QueryCtx,
  imp: Doc<"thirdPartyImports">,
  step: ImportPipelineStep,
  forceReprocess: boolean,
): Promise<boolean> {
  if (shouldSkipStep(imp, step, forceReprocess)) {
    return false;
  }
  if (step === "populate_team_members" && !forceReprocess) {
    if (await importHasTeamMembersPopulated(ctx, imp._id)) {
      return false;
    }
  }
  return true;
}

/** Steps already done or not needed for the current import state (implicit completions). */
export async function collectImplicitlyCompletedSteps(
  ctx: QueryCtx,
  imp: Doc<"thirdPartyImports">,
  forceReprocess: boolean,
  completedSteps: readonly string[],
): Promise<ImportPipelineStep[]> {
  const completed = new Set(completedSteps);
  const implicit: ImportPipelineStep[] = [];

  for (const step of pipelineStepsForImport(imp.source)) {
    if (completed.has(step)) {
      continue;
    }
    if (!(await isStepEligible(ctx, imp, step, forceReprocess))) {
      implicit.push(step);
    }
  }

  return implicit;
}

export function mergeCompletedSteps(
  priorSteps: readonly string[],
  ...additional: ImportPipelineStep[]
): ImportPipelineStep[] {
  const merged: ImportPipelineStep[] = [];
  const seen = new Set<string>();

  for (const step of [...priorSteps, ...additional]) {
    if (seen.has(step)) {
      continue;
    }
    seen.add(step);
    merged.push(step as ImportPipelineStep);
  }

  return merged;
}

export async function resolveNextStepForImport(
  ctx: QueryCtx,
  imp: Doc<"thirdPartyImports">,
  forceReprocess: boolean,
  completedSteps: readonly string[] = [],
): Promise<ImportPipelineStep | null> {
  if (!forceReprocess && imp.pipelineStatus === "Finalized") {
    return null;
  }

  const completed = new Set(completedSteps);

  for (const step of pipelineStepsForImport(imp.source)) {
    if (completed.has(step)) {
      continue;
    }
    if (await isStepEligible(ctx, imp, step, forceReprocess)) {
      return step;
    }
  }

  return null;
}

export function importIsEligibleForBatchQueue(
  imp: Pick<
    Doc<"thirdPartyImports">,
    "source" | "pipelineStatus" | "pipelineLocked"
  >,
): boolean {
  if (imp.pipelineStatus === "Ignored") {
    return false;
  }
  if (!isYuniteSource(imp.source)) {
    return false;
  }
  if (imp.pipelineStatus === "Finalized" && imp.pipelineLocked) {
    return false;
  }
  return true;
}
