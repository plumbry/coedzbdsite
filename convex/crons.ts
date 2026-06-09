import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sync strategy: scheduled jobs handle Discord member/role state daily.
// Manual admin buttons trigger Discord/Yunite/stats syncs on demand.
// Imports and score changes schedule targeted cache rebuilds (see helpers/eventDrivenRebuilds).
// Webhooks only perform small indexed updates (see http.ts / discord.upsertDiscordMember).

// Refresh member activity flags for public directory
crons.daily(
  "refresh member activity flags",
  { hourUTC: 3, minuteUTC: 30 },
  internal.memberManagement.refreshRecentlyActiveFlags,
);

// Sync Discord scheduled events to website every 24 hours
crons.daily(
  "sync discord events",
  { hourUTC: 6, minuteUTC: 0 }, // 6:00 AM UTC daily
  internal.discord.eventSync.syncDiscordEventsInternal,
);

// Sync event bans from Google Sheet daily
crons.daily(
  "sync event bans",
  { hourUTC: 7, minuteUTC: 0 }, // 7:00 AM UTC daily
  internal.eventBans.sync.syncEventBansInternal,
);

// Sync Girl Role verifications from Mod Log daily
crons.daily(
  "sync girl role verifications",
  { hourUTC: 7, minuteUTC: 15 },
  internal.girlRole.sync.syncGirlRoleInternal,
);

// Sync Discord members daily
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

// Continue in-flight aggregate stats cache rebuilds (cron-driven; no deep scheduler chains)
crons.interval(
  "tick aggregate stats rebuilds",
  { seconds: 5 },
  internal.aggregateStats.tickAggregateStatsRebuilds,
);

export default crons;
