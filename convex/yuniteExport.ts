import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";
import { isImportFinalized } from "./lib/importPipeline";
import { isYuniteImport } from "./lib/importSource";

const PAGE_SIZE = 2000;

const exportScope = v.union(v.literal("all"), v.literal("finalized"));

function isFinalizedYuniteImport(importRecord: Doc<"thirdPartyImports">): boolean {
  return (
    isImportFinalized(importRecord) ||
    importRecord.finalizedAt !== undefined ||
    importRecord.dataFullyCached === true
  );
}

function filterYuniteImports(
  imports: Doc<"thirdPartyImports">[],
  scope: "all" | "finalized",
): Doc<"thirdPartyImports">[] {
  return imports.filter((importRecord) => {
    if (!isYuniteImport(importRecord)) {
      return false;
    }
    if (scope === "finalized" && !isFinalizedYuniteImport(importRecord)) {
      return false;
    }
    return true;
  });
}

/** Lightweight summary for the export card — import metadata only. */
export const getYuniteExportSummary = query({
  args: { scope: exportScope },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const imports = await ctx.db.query("thirdPartyImports").collect();
    const yuniteImports = filterYuniteImports(imports, args.scope);

    const withMatchData = yuniteImports.filter(
      (importRecord) => importRecord.matchDataSynced,
    ).length;
    const finalized = yuniteImports.filter(isFinalizedYuniteImport).length;

    return {
      imports: yuniteImports.length,
      withMatchData,
      finalized,
    };
  },
});

/** Yunite import metadata for an export scope. */
export const listYuniteImports = query({
  args: { scope: exportScope },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const imports = await ctx.db.query("thirdPartyImports").collect();
    return filterYuniteImports(imports, args.scope);
  },
});

/** One paginated page of Yunite-linked third-party results. */
export const scanYuniteResultsPage = query({
  args: {
    cursor: v.union(v.string(), v.null()),
    yuniteImportIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const yuniteImportIds = new Set(args.yuniteImportIds);
    const page = await ctx.db
      .query("thirdPartyResults")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor });

    const rows = page.page.filter((row) =>
      yuniteImportIds.has(row.importId as string),
    );

    return {
      rows,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** One paginated page of Yunite-linked match player stats. */
export const scanYuniteMatchStatsPage = query({
  args: {
    cursor: v.union(v.string(), v.null()),
    yuniteImportIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const yuniteImportIds = new Set(args.yuniteImportIds);
    const page = await ctx.db
      .query("matchPlayerStats")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor });

    const rows = page.page.filter((row) =>
      yuniteImportIds.has(row.importId as string),
    );

    return {
      rows,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** One paginated page of Yunite-linked elimination overrides. */
export const scanYuniteEliminationOverridesPage = query({
  args: {
    cursor: v.union(v.string(), v.null()),
    yuniteImportIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const yuniteImportIds = new Set(args.yuniteImportIds);
    const page = await ctx.db
      .query("matchEliminationOverrides")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor });

    const rows = page.page.filter((row) =>
      yuniteImportIds.has(row.importId as string),
    );

    return {
      rows,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export type YuniteExportScope = "all" | "finalized";
