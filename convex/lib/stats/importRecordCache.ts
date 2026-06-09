import type { Doc, Id } from "../../_generated/dataModel.d.ts";
import type { QueryCtx } from "../../_generated/server";

export type ImportRecordCache = Map<string, Doc<"thirdPartyImports"> | null>;

export async function getCachedImportRecord(
  ctx: QueryCtx,
  cache: ImportRecordCache,
  importId: Id<"thirdPartyImports">,
): Promise<Doc<"thirdPartyImports"> | null> {
  const key = importId as string;
  if (!cache.has(key)) {
    cache.set(key, await ctx.db.get(importId));
  }
  return cache.get(key) ?? null;
}
