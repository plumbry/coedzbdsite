import { query } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

// Split backup summary into small/large table queries to avoid scan limits

export const getBackupSummarySmallTables = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const players = await ctx.db.query("players").collect();
    const events = await ctx.db.query("events").collect();
    const imports = await ctx.db.query("thirdPartyImports").collect();
    const aggregateStatsCache = await ctx.db.query("aggregateStatsCache").collect();
    const tierReEvaluationCache = await ctx.db.query("tierReEvaluationCache").collect();
    const tierMediansCache = await ctx.db.query("tierMediansCache").collect();
    
    const AVG_PLAYER_SIZE = 800;
    const AVG_EVENT_SIZE = 500;
    const AVG_IMPORT_SIZE = 400;
    const AVG_AGGREGATE_SIZE = 500;
    const AVG_TIER_EVAL_SIZE = 400;
    const AVG_TIER_MEDIAN_SIZE = 300;
    
    return {
      counts: {
        players: players.length,
        events: events.length,
        imports: imports.length,
        aggregateStatsCache: aggregateStatsCache.length,
        tierReEvaluationCache: tierReEvaluationCache.length,
        tierMediansCache: tierMediansCache.length,
      },
      sizes: {
        players: players.length * AVG_PLAYER_SIZE,
        events: events.length * AVG_EVENT_SIZE,
        imports: imports.length * AVG_IMPORT_SIZE,
        aggregateStatsCache: aggregateStatsCache.length * AVG_AGGREGATE_SIZE,
        tierReEvaluationCache: tierReEvaluationCache.length * AVG_TIER_EVAL_SIZE,
        tierMediansCache: tierMediansCache.length * AVG_TIER_MEDIAN_SIZE,
      },
    };
  },
});

export const getBackupResultsCount = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    let resultsCount = 0;
    let resultsCursor: string | null = null;
    let resultsDone = false;
    while (!resultsDone) {
      const page = await ctx.db.query("thirdPartyResults").paginate({ numItems: 2000, cursor: resultsCursor });
      resultsCount += page.page.length;
      resultsDone = page.isDone;
      resultsCursor = page.continueCursor;
    }
    return { count: resultsCount, size: resultsCount * 300 };
  },
});

export const getBackupMatchStatsCount = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    let matchStatsCount = 0;
    let matchStatsCursor: string | null = null;
    let matchStatsDone = false;
    while (!matchStatsDone) {
      const page = await ctx.db.query("matchPlayerStats").paginate({ numItems: 2000, cursor: matchStatsCursor });
      matchStatsCount += page.page.length;
      matchStatsDone = page.isDone;
      matchStatsCursor = page.continueCursor;
    }
    return { count: matchStatsCount, size: matchStatsCount * 200 };
  },
});

export const getBackupEventResultsCount = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    let eventResultsCount = 0;
    let eventResultsCursor: string | null = null;
    let eventResultsDone = false;
    while (!eventResultsDone) {
      const page = await ctx.db.query("eventResults").paginate({ numItems: 2000, cursor: eventResultsCursor });
      eventResultsCount += page.page.length;
      eventResultsDone = page.isDone;
      eventResultsCursor = page.continueCursor;
    }
    return { count: eventResultsCount, size: eventResultsCount * 250 };
  },
});

export const createFullBackup = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Note: This may still timeout for very large datasets
    // For large datasets, use partial backups instead
    const players = await ctx.db.query("players").collect();
    const events = await ctx.db.query("events").collect();
    const imports = await ctx.db.query("thirdPartyImports").collect();
    const syncStatus = await ctx.db.query("syncStatus").collect();
    const aggregateStatsCache = await ctx.db.query("aggregateStatsCache").collect();
    const tierReEvaluationCache = await ctx.db.query("tierReEvaluationCache").collect();
    const tierMediansCache = await ctx.db.query("tierMediansCache").collect();
    
    // For large tables, use pagination
    const results: unknown[] = [];
    let resultsCursor: string | null = null;
    let resultsDone = false;
    while (!resultsDone) {
      const page = await ctx.db.query("thirdPartyResults").paginate({ numItems: 2000, cursor: resultsCursor });
      results.push(...page.page);
      resultsDone = page.isDone;
      resultsCursor = page.continueCursor;
    }
    
    const matchStats: unknown[] = [];
    let matchStatsCursor: string | null = null;
    let matchStatsDone = false;
    while (!matchStatsDone) {
      const page = await ctx.db.query("matchPlayerStats").paginate({ numItems: 2000, cursor: matchStatsCursor });
      matchStats.push(...page.page);
      matchStatsDone = page.isDone;
      matchStatsCursor = page.continueCursor;
    }
    
    const eventResults: unknown[] = [];
    let eventResultsCursor: string | null = null;
    let eventResultsDone = false;
    while (!eventResultsDone) {
      const page = await ctx.db.query("eventResults").paginate({ numItems: 2000, cursor: eventResultsCursor });
      eventResults.push(...page.page);
      eventResultsDone = page.isDone;
      eventResultsCursor = page.continueCursor;
    }
    
    return {
      backup: {
        timestamp: Date.now(),
        version: "1.1",
        counts: {
          players: players.length,
          events: events.length,
          imports: imports.length,
          results: results.length,
          matchStats: matchStats.length,
          eventResults: eventResults.length,
          aggregateStatsCache: aggregateStatsCache.length,
          tierReEvaluationCache: tierReEvaluationCache.length,
          tierMediansCache: tierMediansCache.length,
        },
        data: {
          players,
          events,
          imports,
          results,
          matchStats,
          eventResults,
          syncStatus,
          aggregateStatsCache,
          tierReEvaluationCache,
          tierMediansCache,
        },
      },
    };
  },
});

export const createPlayerBackup = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const players = await ctx.db.query("players").collect();
    
    return {
      backup: {
        timestamp: Date.now(),
        version: "1.0",
        type: "players",
        count: players.length,
        data: players,
      },
    };
  },
});

export const createEventsBackup = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const events = await ctx.db.query("events").collect();
    
    return {
      backup: {
        timestamp: Date.now(),
        version: "1.0",
        type: "events",
        count: events.length,
        data: events,
      },
    };
  },
});

export const createResultsBackup = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const imports = await ctx.db.query("thirdPartyImports").collect();
    
    // Large tables - paginate
    const results: unknown[] = [];
    let resultsCursor: string | null = null;
    let resultsDone = false;
    while (!resultsDone) {
      const page = await ctx.db.query("thirdPartyResults").paginate({ numItems: 2000, cursor: resultsCursor });
      results.push(...page.page);
      resultsDone = page.isDone;
      resultsCursor = page.continueCursor;
    }
    
    const matchStats: unknown[] = [];
    let matchStatsCursor: string | null = null;
    let matchStatsDone = false;
    while (!matchStatsDone) {
      const page = await ctx.db.query("matchPlayerStats").paginate({ numItems: 2000, cursor: matchStatsCursor });
      matchStats.push(...page.page);
      matchStatsDone = page.isDone;
      matchStatsCursor = page.continueCursor;
    }
    
    const eventResults: unknown[] = [];
    let eventResultsCursor: string | null = null;
    let eventResultsDone = false;
    while (!eventResultsDone) {
      const page = await ctx.db.query("eventResults").paginate({ numItems: 2000, cursor: eventResultsCursor });
      eventResults.push(...page.page);
      eventResultsDone = page.isDone;
      eventResultsCursor = page.continueCursor;
    }
    
    return {
      backup: {
        timestamp: Date.now(),
        version: "1.0",
        type: "results",
        counts: {
          imports: imports.length,
          results: results.length,
          matchStats: matchStats.length,
          eventResults: eventResults.length,
        },
        data: {
          imports,
          results,
          matchStats,
          eventResults,
        },
      },
    };
  },
});
