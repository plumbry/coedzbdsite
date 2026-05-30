"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

export const fetchPlayerStats = action({
  args: { 
    epicName: v.string(),
    timewindow: v.optional(v.union(v.literal("season"), v.literal("lifetime")))
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.FN_API;
    
    if (!apiKey) {
      throw new Error("FN_API environment variable is not set");
    }
    
    const headers = {
      "accept": "*/*",
      "x-api-key": apiKey,
    };

    try {
      console.log("Searching for Epic username:", args.epicName);

      // Step 1: Resolve display name to Epic account ID
      const encodedName = encodeURIComponent(args.epicName);
      const lookupUrl = `https://prod.api-fortnite.com/api/v1/account/displayName/${encodedName}`;
      console.log("Account lookup URL:", lookupUrl);

      const lookupResponse = await fetch(lookupUrl, { headers });
      console.log("Account lookup status:", lookupResponse.status);

      if (!lookupResponse.ok) {
        const errorText = await lookupResponse.text();
        console.error(`Account lookup ${lookupResponse.status}:`, errorText);

        if (lookupResponse.status === 404) {
          return { error: "Player not found. The Epic username may be incorrect.", data: null };
        }
        if (lookupResponse.status === 401 || lookupResponse.status === 403) {
          return { error: `API authentication failed (${lookupResponse.status}).`, data: null };
        }
        return { error: `Unable to look up player (Error ${lookupResponse.status}). Please try again later.`, data: null };
      }

      const accountData = await lookupResponse.json();
      const accountId = accountData.id ?? accountData.accountId;
      if (!accountId) {
        console.error("No account ID in response:", JSON.stringify(accountData));
        return { error: "Could not resolve Epic account ID for this player.", data: null };
      }
      console.log("Resolved account ID:", accountId);

      // Step 2: Fetch stats using v2 endpoint with account ID
      const timeWindow = args.timewindow === "season" ? "season" : "lifetime";
      const statsUrl = `https://prod.api-fortnite.com/api/v2/stats/${accountId}?timeWindow=${timeWindow}`;
      console.log("Stats URL:", statsUrl);

      const statsResponse = await fetch(statsUrl, { headers });
      console.log("Stats response status:", statsResponse.status);

      if (!statsResponse.ok) {
        const errorText = await statsResponse.text();
        console.error(`Stats API ${statsResponse.status}:`, errorText);

        if (statsResponse.status === 404) {
          return { error: "Player not found. The Epic username may be incorrect or the player may have no Zero Build stats.", data: null };
        }
        if (statsResponse.status === 401 || statsResponse.status === 403) {
          return { error: `API authentication failed (${statsResponse.status}).`, data: null };
        }
        return { error: `Unable to fetch stats (Error ${statsResponse.status}). Please try again later.`, data: null };
      }

      const data = await statsResponse.json();

      // Filter to only Zero Build stats to reduce field count (Convex has 1024 field limit)
      const filteredStats: Record<string, number> = {};
      if (data.stats) {
        for (const [key, value] of Object.entries(data.stats)) {
          // Only include nobuildbr stats (exclude arena, tournament, and other modes)
          if (key.includes('nobuildbr') && !key.includes('_arena_') && !key.includes('_tournament_')) {
            filteredStats[key] = value as number;
          }
        }
      }

      const filteredData = {
        displayName: data.displayName ?? accountData.displayName ?? args.epicName,
        stats: filteredStats,
      };

      console.log("Filtered stats count:", Object.keys(filteredStats).length);
      console.log("Timewindow requested:", timeWindow);

      const sampleKeys = Object.keys(filteredStats).slice(0, 3);
      const sampleStats: Record<string, number> = {};
      sampleKeys.forEach(key => { sampleStats[key] = filteredStats[key]; });
      console.log("Sample stats:", JSON.stringify(sampleStats));

      return { data: filteredData, error: null };
    } catch (error) {
      console.error("Fortnite API error:", error);

      if (error instanceof Error) {
        if (error.message.includes("ENOTFOUND") || error.message.includes("fetch failed")) {
          return { error: "Unable to reach Fortnite API. The service may be unavailable.", data: null };
        }
        return { error: error.message, data: null };
      }

      return { error: "Failed to fetch stats", data: null };
    }
  },
});
