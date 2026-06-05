import type { Doc } from "../../_generated/dataModel.d.ts";
import type { QueryCtx } from "../../_generated/server";
import { isYuniteImport } from "../importSource";

/** Keep only rows from Yunite imports (excludes external CSV). */
export async function filterThirdPartyResultsToYunite(
  ctx: QueryCtx,
  results: Doc<"thirdPartyResults">[],
): Promise<Doc<"thirdPartyResults">[]> {
  const importIsYunite = new Map<string, boolean>();
  const yuniteResults: Doc<"thirdPartyResults">[] = [];

  for (const result of results) {
    const importKey = result.importId as string;
    let isYunite = importIsYunite.get(importKey);
    if (isYunite === undefined) {
      const importRecord = await ctx.db.get(result.importId);
      isYunite = importRecord ? isYuniteImport(importRecord) : false;
      importIsYunite.set(importKey, isYunite);
    }
    if (isYunite) {
      yuniteResults.push(result);
    }
  }

  return yuniteResults;
}
