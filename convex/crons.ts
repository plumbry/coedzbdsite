import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sync strategy: Discord member/role sync is admin-triggered only (see discord/sync.ts).
// Manual admin buttons trigger Yunite/stats syncs on demand.
// Imports and score changes schedule targeted cache rebuilds (see helpers/eventDrivenRebuilds).

// Clear recently-active flags for players past the inactivity threshold
crons.daily(
  "mark inactive members",
  { hourUTC: 3, minuteUTC: 30 },
  internal.memberManagement.markInactivePlayersPastThreshold,
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

export default crons;
