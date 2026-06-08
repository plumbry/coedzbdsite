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

export async function resolveNextStepForImport(
  ctx: QueryCtx,
  imp: Doc<"thirdPartyImports">,
  forceReprocess: boolean,
): Promise<ImportPipelineStep | null> {
  if (!forceReprocess && imp.pipelineStatus === "Finalized") {
    return null;
  }

  for (const step of pipelineStepsForImport(imp.source)) {
    if (shouldSkipStep(imp, step, forceReprocess)) {
      continue;
    }
    if (step === "populate_team_members" && !forceReprocess) {
      if (await importHasTeamMembersPopulated(ctx, imp._id)) {
        continue;
      }
    }
    return step;
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
