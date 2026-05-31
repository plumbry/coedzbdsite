import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Refresh member activity flags for public directory
crons.daily(
  "refresh member activity flags",
  { hourUTC: 3, minuteUTC: 30 },
  internal.memberManagement.refreshRecentlyActiveFlags,
);

// Prune old admin chat messages (keep latest 500)
crons.weekly(
  "prune old chat messages",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  internal.chat.pruneOldChatMessages,
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

export default crons;
