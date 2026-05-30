import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

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

export default crons;
