"use node";

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { requireAdminAction } from "../auth_helpers";

interface DiscordScheduledEvent {
  id: string;
  name: string;
  description: string | null;
  scheduled_start_time: string; // ISO 8601
  scheduled_end_time: string | null; // ISO 8601
  status: number; // 1=SCHEDULED, 2=ACTIVE, 3=COMPLETED, 4=CANCELED
  entity_type: number; // 1=STAGE_INSTANCE, 2=VOICE, 3=EXTERNAL
}

type SyncResult = {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  removed: number;
  errors: string[];
};

async function fetchAndSyncDiscordEvents(ctx: ActionCtx): Promise<SyncResult> {
  const discordBotToken = process.env.DISCORD_BOT_TOKEN;
  const discordGuildId = process.env.DISCORD_GUILD_ID;

  if (!discordBotToken) {
    throw new Error("DISCORD_BOT_TOKEN environment variable is not set");
  }

  if (!discordGuildId) {
    throw new Error("DISCORD_GUILD_ID environment variable is not set");
  }

  // Fetch scheduled events from Discord API
  const url = `https://discord.com/api/v10/guilds/${discordGuildId}/scheduled-events`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${discordBotToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord API error: ${response.status} - ${errorText}`);
  }

  const discordEvents: DiscordScheduledEvent[] = await response.json();

  // Only process SCHEDULED (1) and ACTIVE (2) events - skip completed/canceled
  const activeEvents = discordEvents.filter(
    (e) => e.status === 1 || e.status === 2,
  );

  // Run the internal mutation to process the sync
  const result: {
    imported: number;
    updated: number;
    skipped: number;
    removed: number;
    errors: string[];
  } = await ctx.runMutation(internal.discord.eventSyncMutations.processDiscordEventSync, {
      discordEvents: activeEvents.map((e) => ({
        id: e.id,
        name: e.name,
        description: e.description || undefined,
        startTime: e.scheduled_start_time,
        endTime: e.scheduled_end_time || e.scheduled_start_time,
      })),
    });

  return {
    success: true,
    ...result,
  };
}

// Admin manual sync — daily cron uses syncDiscordEventsInternal.
export const syncDiscordEvents = action({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    await requireAdminAction(ctx);
    return fetchAndSyncDiscordEvents(ctx);
  },
});

// Internal action for cron job
export const syncDiscordEventsInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    await fetchAndSyncDiscordEvents(ctx);
  },
});
