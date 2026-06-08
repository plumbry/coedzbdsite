"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// Parse ICS file content and extract event information
function parseICS(icsContent: string) {
  const events: Array<{
    name: string;
    startDate: string;
    endDate: string;
    description?: string;
  }> = [];

  // Split by VEVENT blocks
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;

  while ((match = veventRegex.exec(icsContent)) !== null) {
    const eventBlock = match[1];
    
    // Extract SUMMARY (event name)
    const summaryMatch = eventBlock.match(/SUMMARY:(.*?)(?:\r?\n|\r)/);
    const name = summaryMatch ? summaryMatch[1].trim() : "Untitled Event";
    
    // Extract DTSTART (start date)
    const dtstartMatch = eventBlock.match(/DTSTART[^:]*:(.*?)(?:\r?\n|\r)/);
    const startDate = dtstartMatch ? parseICSDate(dtstartMatch[1].trim()) : "";
    
    // Extract DTEND (end date)
    const dtendMatch = eventBlock.match(/DTEND[^:]*:(.*?)(?:\r?\n|\r)/);
    const endDate = dtendMatch ? parseICSDate(dtendMatch[1].trim()) : startDate;
    
    // Extract DESCRIPTION
    const descriptionMatch = eventBlock.match(/DESCRIPTION:(.*?)(?:\r?\n(?! )|\r(?! ))/s);
    const description = descriptionMatch ? descriptionMatch[1].trim().replace(/\\n/g, "\n") : undefined;
    
    if (name && startDate) {
      events.push({
        name,
        startDate,
        endDate,
        description,
      });
    }
  }

  return events;
}

// Parse ICS date format to ISO string
function parseICSDate(icsDate: string): string {
  // ICS dates can be in formats like:
  // 20250120T100000Z (UTC)
  // 20250120T100000 (floating)
  // 20250120 (all-day)
  
  // Remove any timezone info for now
  const cleanDate = icsDate.split(";")[0].replace(/[^0-9TZ]/g, "");
  
  // Handle different formats
  if (cleanDate.length === 8) {
    // All-day format: YYYYMMDD
    const year = cleanDate.substring(0, 4);
    const month = cleanDate.substring(4, 6);
    const day = cleanDate.substring(6, 8);
    return `${year}-${month}-${day}`;
  } else if (cleanDate.includes("T")) {
    // DateTime format: YYYYMMDDTHHmmssZ
    const year = cleanDate.substring(0, 4);
    const month = cleanDate.substring(4, 6);
    const day = cleanDate.substring(6, 8);
    const hour = cleanDate.substring(9, 11);
    const minute = cleanDate.substring(11, 13);
    
    // Return ISO format
    return `${year}-${month}-${day}T${hour}:${minute}:00`;
  }
  
  return cleanDate;
}

export const parseAndImportICS = action({
  args: {
    icsContent: v.string(),
    defaultType: v.union(
      v.literal("scrim"),
      v.literal("season"),
      v.literal("mini-season"),
      v.literal("random"),
      v.literal("random-squads"),
      v.literal("random-trios"),
      v.literal("solos-meets-duos"),
      v.literal("scrim-series"),
      v.literal("showdown")
    ),
    defaultMode: v.union(v.literal("ZB Main Map"), v.literal("Reload")),
  },
  handler: async (ctx, args) => {
    // Get current user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Parse ICS file
    const parsedEvents = parseICS(args.icsContent);
    
    if (parsedEvents.length === 0) {
      throw new Error("No valid events found in ICS file");
    }

    // Create events in database using regular mutation (not internal)
    const createdEvents: Array<{
      name: string;
      id: string;
    }> = [];

    for (const event of parsedEvents) {
      const eventId = await ctx.runMutation(api.events.management.createEvent, {
        name: event.name,
        type: args.defaultType,
        mode: args.defaultMode,
        startDate: event.startDate,
        endDate: event.endDate,
        description: event.description,
        season: undefined,
        standardLeaderboards: [],
        qualifierLobby1Leaderboards: [],
        qualifierLobby2Leaderboards: [],
        finalsLeaderboards: [],
        excludeLowestScore: false,
        seasonId: undefined,
        skipFirstNWeeksPoints: undefined,
      });

      createdEvents.push({
        name: event.name,
        id: eventId,
      });
    }

    return {
      success: true,
      eventsCreated: createdEvents.length,
      events: createdEvents,
    };
  },
});
