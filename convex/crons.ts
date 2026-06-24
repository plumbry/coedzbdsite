import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sync strategy: Discord member sync runs daily via cron; admins can also trigger manual syncs.
// Manual admin buttons trigger Yunite/stats syncs on demand.
// Imports and score changes schedule targeted cache rebuilds (see helpers/eventDrivenRebuilds).

// Clear recently-active flags for players past the inactivity threshold
crons.daily(
  "mark inactive members",
  { hourUTC: 3, minuteUTC: 30 },
  internal.memberManagement.markInactivePlayersPastThreshold,
);

// Sync Discord guild members daily (profiles, roles, archive missing)
crons.daily(
  "sync discord members",
  { hourUTC: 5, minuteUTC: 0 }, // 5:00 AM UTC daily
  internal.discord.sync.syncDiscordMembersInternal,
);

// Refresh Osirion tournament cache for in-game earnings scans
crons.daily(
  "refresh tournament scan cache",
  { hourUTC: 4, minuteUTC: 0 }, // 4:00 AM UTC daily
  internal.inGameEarnings.actions.refreshTournamentCache,
);

export default crons;
