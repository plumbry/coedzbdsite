import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const processDiscordEventSync = internalMutation({
  args: {
    discordEvents: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        startTime: v.string(), // ISO 8601
        endTime: v.string(), // ISO 8601
      }),
    ),
  },
  handler: async (ctx, args): Promise<{
    imported: number;
    updated: number;
    skipped: number;
    removed: number;
    errors: string[];
  }> => {
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let removed = 0;
    const errors: string[] = [];

    // Get all existing events with Discord event IDs
    const existingEvents = await ctx.db.query("events").collect();
    const discordLinkedEvents = existingEvents.filter(
      (e) => e.discordEventId,
    );

    // Track which Discord event IDs are still active
    const activeDiscordIds = new Set(args.discordEvents.map((e) => e.id));

    // Remove events that are no longer in Discord (only if date hasn't passed)
    const now = new Date();
    for (const event of discordLinkedEvents) {
      if (!activeDiscordIds.has(event.discordEventId!)) {
        const eventStart = new Date(event.startDate);
        // Only delete if the event hasn't started yet
        if (eventStart > now) {
          await ctx.db.delete(event._id);
          removed++;
        }
      }
    }

    // Get a system user for createdBy (first admin)
    const adminUser = await ctx.db
      .query("users")
      .collect()
      .then((users) => users.find((u) => u.role === "admin"));

    if (!adminUser) {
      return {
        imported: 0,
        updated: 0,
        skipped: 0,
        removed,
        errors: ["No admin user found to attribute events to"],
      };
    }

    // Import new Discord events
    for (const discordEvent of args.discordEvents) {
      try {
        // Check if this Discord event already exists in our database
        const existingByDiscordId = await ctx.db
          .query("events")
          .withIndex("by_discord_event_id", (q) =>
            q.eq("discordEventId", discordEvent.id),
          )
          .first();

        if (existingByDiscordId) {
          const patch: {
            name?: string;
            startDate?: string;
            endDate?: string;
            description?: string;
            status?: "upcoming" | "ongoing" | "completed";
          } = {};

          if (existingByDiscordId.name !== discordEvent.name) {
            patch.name = discordEvent.name;
          }
          if (existingByDiscordId.startDate !== discordEvent.startTime) {
            patch.startDate = discordEvent.startTime;
          }
          if (existingByDiscordId.endDate !== discordEvent.endTime) {
            patch.endDate = discordEvent.endTime;
          }
          const nextDescription = discordEvent.description ?? undefined;
          if (existingByDiscordId.description !== nextDescription) {
            patch.description = nextDescription;
          }

          const startDate = new Date(discordEvent.startTime);
          const endDate = new Date(discordEvent.endTime);
          let status: "upcoming" | "ongoing" | "completed" = "upcoming";
          if (now > endDate) {
            status = "completed";
          } else if (now >= startDate) {
            status = "ongoing";
          }
          if (existingByDiscordId.status !== status) {
            patch.status = status;
          }

          if (Object.keys(patch).length > 0) {
            await ctx.db.patch(existingByDiscordId._id, patch);
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        // Check if an event on the same date already exists (any event, not just Discord-synced)
        const startDateStr = new Date(discordEvent.startTime)
          .toISOString()
          .split("T")[0]!;
        const eventsOnSameDay = existingEvents.filter((e) => {
          const eDate = new Date(e.startDate).toISOString().split("T")[0];
          return eDate === startDateStr;
        });

        if (eventsOnSameDay.length > 0) {
          skipped++;
          continue;
        }

        // Compute status based on dates
        const startDate = new Date(discordEvent.startTime);
        const endDate = new Date(discordEvent.endTime);
        let status: "upcoming" | "ongoing" | "completed" = "upcoming";
        if (now > endDate) {
          status = "completed";
        } else if (now >= startDate) {
          status = "ongoing";
        }

        // Create the event with needsSetup flag
        await ctx.db.insert("events", {
          name: discordEvent.name,
          type: "scrim", // Default type - admin must change
          mode: "ZB Main Map", // Default mode - admin must change
          startDate: discordEvent.startTime,
          endDate: discordEvent.endTime,
          description: discordEvent.description,
          status,
          createdBy: adminUser._id,
          discordEventId: discordEvent.id,
          needsSetup: true,
        });

        imported++;
      } catch (error) {
        errors.push(
          `Failed to import "${discordEvent.name}": ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    return { imported, updated, skipped, removed, errors };
  },
});
