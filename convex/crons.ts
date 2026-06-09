import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sync strategy: Discord member/role sync is admin-triggered only (see discord/sync.ts).
// Manual admin buttons trigger Yunite/stats syncs on demand.
// Imports and score changes schedule targeted cache rebuilds (see helpers/eventDrivenRebuilds).

// Refresh member activity flags for public directory
crons.daily(
  "refresh member activity flags",
  { hourUTC: 3, minuteUTC: 30 },
  internal.memberManagement.refreshRecentlyActiveFlags,
);

// Sync event bans from Google Sheet daily
crons.daily(
  "sync event bans",
  { hourUTC: 7, minuteUTC: 0 }, // 7:00 AM UTC daily
  internal.eventBans.sync.syncEventBansInternal,
);

// Refresh Osirion tournament cache for in-game earnings scans
crons.daily(
  "refresh tournament scan cache",
  { hourUTC: 4, minuteUTC: 0 }, // 4:00 AM UTC daily
  internal.inGameEarnings.actions.refreshTournamentCache,
);

// Continue in-flight aggregate stats cache rebuilds (cron-driven; no deep scheduler chains)
crons.interval(
  "tick aggregate stats rebuilds",
  { seconds: 5 },
  internal.aggregateStats.tickAggregateStatsRebuilds,
);

export default crons;
