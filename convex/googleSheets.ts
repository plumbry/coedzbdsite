"use node";

import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { sheets } from "@googleapis/sheets";
import { JWT } from "google-auth-library";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
type SheetPlayer = Doc<"players">;
type SheetScore = {
  playerId: Id<"players">;
  totalScore?: number;
  thirdPartyExperience?: number;
  thirdPartyPerformance?: number;
  inGameTourneyPerformance?: number;
  officialEarnings?: number;
  rankedPerformance?: number;
  hoursPlayed?: number;
  notorietyTeammates?: number;
  age?: number;
  gender?: number;
  ability?: number;
  region?: number;
  gameSense?: number;
  seasonPerformance?: number;
  modifiers?: number;
};

// Helper to authenticate with Google Sheets using service account
async function getGoogleSheetsClient() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  
  if (!credentials) {
    throw new ConvexError({
      message: "GOOGLE_SERVICE_ACCOUNT_CREDENTIALS not configured. Please add your service account JSON in Secrets.",
      code: "NOT_IMPLEMENTED",
    });
  }
  
  let serviceAccountKey;
  try {
    serviceAccountKey = JSON.parse(credentials);
  } catch {
    throw new ConvexError({
      message: "Invalid GOOGLE_SERVICE_ACCOUNT_CREDENTIALS format. Must be valid JSON.",
      code: "BAD_REQUEST",
    });
  }
  
  const auth = new JWT({
    email: serviceAccountKey.client_email,
    key: serviceAccountKey.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  
  const sheetsClient = sheets({ version: "v4", auth });
  return sheetsClient;
}

// Export player list with evaluation stats to Google Sheets
export const exportPlayersToSheets = action({
  args: { spreadsheetId: v.string() },
  handler: async (ctx, args): Promise<{
    success: boolean;
    playersExported: number;
    timestamp: string;
    spreadsheetUrl: string;
  }> => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    try {
      const sheets = await getGoogleSheetsClient();
      
      // Use lightweight queries to stay under read limits
      const allPlayers = (await ctx.runQuery(
        api.players.getPlayersForExport,
        {},
      )) as SheetPlayer[];
      const allScores = (await ctx.runQuery(
        api.scores.getAllScoresMap,
        {},
      )) as SheetScore[];
      
      // Build a lookup map for scores by playerId
      const scoresMap = new Map<string, SheetScore>();
      for (const score of allScores) {
        scoresMap.set(score.playerId, score);
      }
      
      // Filter to only active members
      const players = allPlayers.filter(p => p.currentMembershipStatus === "accepted");
      
      if (!players || players.length === 0) {
        throw new ConvexError({
          message: "No active players found",
          code: "NOT_FOUND",
        });
      }
      
      // Join players with scores
      const playersWithScores = players.map((player) => ({
        player,
        score: scoresMap.get(player._id) ?? null,
      }));
      
      // Sort by Tier Score in descending order (highest to lowest)
      playersWithScores.sort((a, b) => {
        const scoreA = a.score?.totalScore ?? 0;
        const scoreB = b.score?.totalScore ?? 0;
        return scoreB - scoreA;
      });
      
      // Prepare data for Google Sheets
      const headers = [
        "Discord Username",
        "Discord ID",
        "Tier Score",
        "Tier",
        "Third Party Performance",
        "In-Game Tourney Performance",
        "Official Earnings",
        "Ranked Performance",
        "Hours Played",
        "Third Party Experience",
        "Notoriety/Teammates",
        "Age",
        "Gender",
        "Ability",
        "Region",
        "Game Sense",
        "Season Performance",
        "Modifiers",
        "Status",
        "Admin Comments",
      ];
      
      const rows = playersWithScores.map(({ player, score }) => [
        player.discordUsername,
        player.discordUserId || "",
        score?.totalScore ? Math.round(score.totalScore).toString() : "",
        player.tier || "Unranked",
        score?.thirdPartyPerformance ?? "",
        score?.inGameTourneyPerformance ?? "",
        score?.officialEarnings ?? "",
        score?.rankedPerformance ?? "",
        score?.hoursPlayed ?? "",
        score?.thirdPartyExperience ?? "",
        score?.notorietyTeammates ?? "",
        score?.age ?? "",
        score?.gender ?? "",
        score?.ability ?? "",
        score?.region ?? "",
        score?.gameSense ?? "",
        score?.seasonPerformance ?? "",
        score?.modifiers ?? "",
        player.currentMembershipStatus === "accepted" ? "active" : 
          player.currentMembershipStatus === "former" ? "archived" :
          player.currentMembershipStatus === "rejected" ? "rejected" : "active",
        player.adminComments || "",
      ]);
      
      // Clear existing data and write new data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: args.spreadsheetId,
        range: "Players!A1:Z",
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: args.spreadsheetId,
        range: "Players!A1",
        valueInputOption: "RAW",
        requestBody: {
          values: [headers, ...rows],
        },
      });
      
      // Format the header row
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: args.spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.6, blue: 0.9 },
                    textFormat: {
                      bold: true,
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                    },
                    horizontalAlignment: "CENTER",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
              },
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: 0,
                  dimension: "COLUMNS",
                  startIndex: 0,
                  endIndex: headers.length,
                },
              },
            },
          ],
        },
      });
      
      const timestamp = new Date().toISOString();
      return {
        success: true,
        playersExported: players.length,
        timestamp,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${args.spreadsheetId}`,
      };
    } catch (error) {
      console.error("Google Sheets API error:", error);
      throw new ConvexError({
        message: `Failed to export to Google Sheets: ${error instanceof Error ? error.message : "Unknown error"}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
  },
});

// Export rejected players to Google Sheets
export const exportRejectedPlayersToSheets = action({
  args: { spreadsheetId: v.string() },
  handler: async (ctx, args): Promise<{
    success: boolean;
    playersExported: number;
    timestamp: string;
    spreadsheetUrl: string;
  }> => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    try {
      const sheets = await getGoogleSheetsClient();
      
      // Use lightweight queries to stay under read limits
      const allPlayers = (await ctx.runQuery(
        api.players.getPlayersForExport,
        {},
      )) as SheetPlayer[];
      const allScores = (await ctx.runQuery(
        api.scores.getAllScoresMap,
        {},
      )) as SheetScore[];
      
      // Build a lookup map for scores by playerId
      const scoresMap = new Map<string, SheetScore>();
      for (const score of allScores) {
        scoresMap.set(score.playerId, score);
      }
      
      // Filter to only rejected members
      const players = allPlayers.filter(p => p.currentMembershipStatus === "rejected");
      
      // If no rejected players, return success with 0 exports
      if (!players || players.length === 0) {
        return {
          success: true,
          playersExported: 0,
          timestamp: new Date().toISOString(),
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${args.spreadsheetId}`,
        };
      }
      
      // Join players with scores
      const playersWithScores = players.map((player) => ({
        player,
        score: scoresMap.get(player._id) ?? null,
      }));
      
      // Sort by Tier Score in descending order (highest to lowest)
      playersWithScores.sort((a, b) => {
        const scoreA = a.score?.totalScore ?? 0;
        const scoreB = b.score?.totalScore ?? 0;
        return scoreB - scoreA;
      });
      
      // Prepare data for Google Sheets
      const headers = [
        "Discord Username",
        "Discord ID",
        "Tier Score",
        "Tier",
        "Third Party Performance",
        "In-Game Tourney Performance",
        "Official Earnings",
        "Ranked Performance",
        "Hours Played",
        "Third Party Experience",
        "Notoriety/Teammates",
        "Age",
        "Gender",
        "Ability",
        "Region",
        "Game Sense",
        "Season Performance",
        "Modifiers",
      ];
      
      const rows = playersWithScores.map(({ player, score }) => [
        player.discordUsername,
        player.discordUserId || "",
        score?.totalScore ? Math.round(score.totalScore).toString() : "",
        player.tier || "Unranked",
        score?.thirdPartyPerformance ?? "",
        score?.inGameTourneyPerformance ?? "",
        score?.officialEarnings ?? "",
        score?.rankedPerformance ?? "",
        score?.hoursPlayed ?? "",
        score?.thirdPartyExperience ?? "",
        score?.notorietyTeammates ?? "",
        score?.age ?? "",
        score?.gender ?? "",
        score?.ability ?? "",
        score?.region ?? "",
        score?.gameSense ?? "",
        score?.seasonPerformance ?? "",
        score?.modifiers ?? "",
      ]);
      
      // Clear existing data and write new data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: args.spreadsheetId,
        range: "Rejected!A1:Z",
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: args.spreadsheetId,
        range: "Rejected!A1",
        valueInputOption: "RAW",
        requestBody: {
          values: [headers, ...rows],
        },
      });
      
      // Format the header row
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: args.spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.6, blue: 0.9 },
                    textFormat: {
                      bold: true,
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                    },
                    horizontalAlignment: "CENTER",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
              },
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: 0,
                  dimension: "COLUMNS",
                  startIndex: 0,
                  endIndex: headers.length,
                },
              },
            },
          ],
        },
      });
      
      const timestamp = new Date().toISOString();
      return {
        success: true,
        playersExported: players.length,
        timestamp,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${args.spreadsheetId}`,
      };
    } catch (error) {
      console.error("Google Sheets API error:", error);
      throw new ConvexError({
        message: `Failed to export rejected players to Google Sheets: ${error instanceof Error ? error.message : "Unknown error"}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
  },
});

// Export archived players to Google Sheets
export const exportArchivedPlayersToSheets = action({
  args: { spreadsheetId: v.string() },
  handler: async (ctx, args): Promise<{
    success: boolean;
    playersExported: number;
    timestamp: string;
    spreadsheetUrl: string;
  }> => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    try {
      const sheets = await getGoogleSheetsClient();
      
      const allPlayers = (await ctx.runQuery(
        api.players.getPlayersForExport,
        {},
      )) as SheetPlayer[];
      const allScores = (await ctx.runQuery(
        api.scores.getAllScoresMap,
        {},
      )) as SheetScore[];
      const tierEvalCache = (await ctx.runQuery(
        api.tierReEvaluation.getCachedTierReEvaluationData,
        {},
      )) as {
        evaluations?: Array<{ playerId: Id<"players">; holisticScore: number }>;
      } | null;
      const holisticByPlayer = new Map<Id<"players">, number>(
        (tierEvalCache?.evaluations ?? []).map((e) => [e.playerId, e.holisticScore]),
      );

      // Build a lookup map for scores by playerId
      const scoresMap = new Map<string, SheetScore>();
      for (const score of allScores) {
        scoresMap.set(score.playerId, score);
      }
      
      // Filter to only former members
      const players = allPlayers.filter(p => p.currentMembershipStatus === "former");
      
      // If no archived players, return success with 0 exports
      if (!players || players.length === 0) {
        return {
          success: true,
          playersExported: 0,
          timestamp: new Date().toISOString(),
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${args.spreadsheetId}`,
        };
      }
      
      // Join players with scores
      const playersWithScores = players.map((player) => ({
        player,
        score: scoresMap.get(player._id) ?? null,
      }));
      
      // Sort by Tier Score in descending order (highest to lowest)
      playersWithScores.sort((a, b) => {
        const scoreA = a.score?.totalScore ?? 0;
        const scoreB = b.score?.totalScore ?? 0;
        return scoreB - scoreA;
      });
      
      // Prepare data for Google Sheets
      const headers = [
        "Discord Username",
        "Discord ID",
        "Nickname",
        "Epic Username",
        "Tier",
        "Tier Score",
        "Holistic Score",
        "Has Left Server",
        "Archive Reason",
        // Evaluation Categories
        "Third Party Experience",
        "Third Party Performance",
        "In-Game Tourney Performance",
        "Official Earnings",
        "Ranked Performance",
        "Hours Played",
        "Notoriety/Teammates",
        "Age",
        "Gender",
        "Ability",
        "Region",
        "Game Sense",
        "Season Performance",
        "Modifiers",
      ];
      
      const rows = playersWithScores.map(({ player, score }) => [
        player.discordUsername,
        player.discordUserId || "",
        player.nickname || "",
        player.epicUsername,
        player.tier || "Unranked",
        score?.totalScore ? Math.round(score.totalScore).toString() : "",
        holisticByPlayer.has(player._id)
          ? holisticByPlayer.get(player._id)!.toFixed(1)
          : "",
        player.hasLeftServer ? "Yes" : "No",
        player.archiveReason || "",
        // Evaluation Categories
        score?.thirdPartyExperience ?? "",
        score?.thirdPartyPerformance ?? "",
        score?.inGameTourneyPerformance ?? "",
        score?.officialEarnings ?? "",
        score?.rankedPerformance ?? "",
        score?.hoursPlayed ?? "",
        score?.notorietyTeammates ?? "",
        score?.age ?? "",
        score?.gender ?? "",
        score?.ability ?? "",
        score?.region ?? "",
        score?.gameSense ?? "",
        score?.seasonPerformance ?? "",
        score?.modifiers ?? "",
      ]);
      
      // Clear existing data and write new data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: args.spreadsheetId,
        range: "Archived!A1:Z",
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: args.spreadsheetId,
        range: "Archived!A1",
        valueInputOption: "RAW",
        requestBody: {
          values: [headers, ...rows],
        },
      });
      
      // Format the header row
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: args.spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.6, blue: 0.9 },
                    textFormat: {
                      bold: true,
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                    },
                    horizontalAlignment: "CENTER",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
              },
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: 0,
                  dimension: "COLUMNS",
                  startIndex: 0,
                  endIndex: headers.length,
                },
              },
            },
          ],
        },
      });
      
      const timestamp = new Date().toISOString();
      return {
        success: true,
        playersExported: players.length,
        timestamp,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${args.spreadsheetId}`,
      };
    } catch (error) {
      console.error("Google Sheets API error:", error);
      throw new ConvexError({
        message: `Failed to export archived players to Google Sheets: ${error instanceof Error ? error.message : "Unknown error"}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
  },
});

// Export tier re-evaluations to Google Sheets
export const exportReEvaluationsToSheets = action({
  args: { spreadsheetId: v.string() },
  handler: async (ctx, args): Promise<{
    success: boolean;
    playersExported: number;
    timestamp: string;
    spreadsheetUrl: string;
  }> => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    try {
      const sheets = await getGoogleSheetsClient();
      
      // Get cached tier re-evaluation data
      const cacheData = await ctx.runQuery(api.tierReEvaluation.getCachedTierReEvaluationData, {});
      
      if (!cacheData || !cacheData.evaluations || cacheData.evaluations.length === 0) {
        throw new ConvexError({
          message: "No tier re-evaluation data found. Please rebuild the cache first.",
          code: "NOT_FOUND",
        });
      }
      
      const cachedEvaluations = cacheData.evaluations;
      
      // Prepare data for Google Sheets
      const headers = [
        "Player Name",
        "Discord Username",
        "Discord ID",
        "Current Tier",
        "Events",
        "Kills/Match",
        "Deaths/Match",
        "Holistic Score",
        "Placement Score",
        "Win Rate Score",
        "Kills Score",
        "Deaths Score",
        "vs Tier Above (%)",
        "vs Same Tier (%)",
        "vs Tier Below (%)",
        "Top 5 Count",
        "Top 4 Count",
        "Top 3 Count",
        "Consistent Teammate",
        "Evaluation Status",
      ];
      
      const rows = cachedEvaluations.map((evaluation: typeof cachedEvaluations[number]) => [
        evaluation.playerName,
        evaluation.discordUsername,
        evaluation.discordUserId || "",
        evaluation.tier,
        evaluation.totalEvents,
        evaluation.killsPerMatch.toFixed(2),
        evaluation.deathsPerMatch?.toFixed(2) || "0.00",
        evaluation.holisticScore.toFixed(2),
        evaluation.placementScore.toFixed(2),
        evaluation.winRateScore.toFixed(2),
        evaluation.killsScore.toFixed(2),
        evaluation.deathsScore?.toFixed(2) || "0.00",
        evaluation.promotionDiff !== null && evaluation.promotionDiff !== undefined ? `${evaluation.promotionDiff > 0 ? "+" : ""}${evaluation.promotionDiff.toFixed(1)}%` : "N/A",
        evaluation.holisticVsSameTier !== null && evaluation.holisticVsSameTier !== undefined ? `${evaluation.holisticVsSameTier > 0 ? "+" : ""}${evaluation.holisticVsSameTier.toFixed(1)}%` : "N/A",
        evaluation.demotionDiff !== null && evaluation.demotionDiff !== undefined ? `${evaluation.demotionDiff < 0 ? "+" : ""}${Math.abs(evaluation.demotionDiff).toFixed(1)}%` : "N/A",
        evaluation.recentTop5Count || 0,
        evaluation.recentTop4Count || 0,
        evaluation.recentTop3Count || 0,
        evaluation.consistentTeammateName || "N/A",
        evaluation.evaluationStatus,
      ]);
      
      // Clear existing data and write new data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: args.spreadsheetId,
        range: "Re-Evaluations!A1:Z",
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: args.spreadsheetId,
        range: "Re-Evaluations!A1",
        valueInputOption: "RAW",
        requestBody: {
          values: [headers, ...rows],
        },
      });
      
      // Format the header row
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: args.spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.6, blue: 0.9 },
                    textFormat: {
                      bold: true,
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                    },
                    horizontalAlignment: "CENTER",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
              },
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: 0,
                  dimension: "COLUMNS",
                  startIndex: 0,
                  endIndex: headers.length,
                },
              },
            },
          ],
        },
      });
      
      const timestamp = new Date().toISOString();
      return {
        success: true,
        playersExported: cachedEvaluations.length,
        timestamp,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${args.spreadsheetId}`,
      };
    } catch (error) {
      console.error("Google Sheets API error:", error);
      throw new ConvexError({
        message: `Failed to export tier re-evaluations to Google Sheets: ${error instanceof Error ? error.message : "Unknown error"}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
  },
});

// Export holistic scores to Google Sheets
export const exportHolisticScoresToSheets = action({
  args: { spreadsheetId: v.string() },
  handler: async (ctx, args): Promise<{
    success: boolean;
    playersExported: number;
    timestamp: string;
    spreadsheetUrl: string;
  }> => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    try {
      const sheets = await getGoogleSheetsClient();
      
      // Get cached tier re-evaluation data (which includes holistic scores)
      const cacheData = await ctx.runQuery(api.tierReEvaluation.getCachedTierReEvaluationData, {});
      
      if (!cacheData || !cacheData.evaluations || cacheData.evaluations.length === 0) {
        throw new ConvexError({
          message: "No holistic score data found. Please rebuild the cache first.",
          code: "NOT_FOUND",
        });
      }
      
      // Sort by holistic score descending
      const sortedEvaluations = [...cacheData.evaluations].sort((a, b) => b.holisticScore - a.holisticScore);
      
      // Prepare data for Google Sheets
      const headers = [
        "Rank",
        "Player Name",
        "Discord Username",
        "Discord ID",
        "Current Tier",
        "Holistic Score",
        "Placement Score",
        "Win Rate Score",
        "Kills Score",
        "Deaths Score",
        "Events",
        "Avg Placement",
        "Win Rate %",
        "Kills/Match",
        "Deaths/Match",
        "Evaluation Status",
      ];
      
      const rows = sortedEvaluations.map((evaluation, index) => [
        index + 1,
        evaluation.playerName,
        evaluation.discordUsername,
        evaluation.discordUserId || "",
        evaluation.tier,
        evaluation.holisticScore.toFixed(2),
        evaluation.placementScore.toFixed(2),
        evaluation.winRateScore.toFixed(2),
        evaluation.killsScore.toFixed(2),
        evaluation.deathsScore?.toFixed(2) || "0.00",
        evaluation.totalEvents,
        evaluation.avgPlacement.toFixed(2),
        evaluation.winRate.toFixed(1),
        evaluation.killsPerMatch.toFixed(2),
        evaluation.deathsPerMatch?.toFixed(2) || "0.00",
        evaluation.evaluationStatus,
      ]);
      
      // Clear existing data and write new data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: args.spreadsheetId,
        range: "Holistic Scores!A1:Z",
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: args.spreadsheetId,
        range: "Holistic Scores!A1",
        valueInputOption: "RAW",
        requestBody: {
          values: [headers, ...rows],
        },
      });
      
      // Format the header row
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: args.spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.6, blue: 0.9 },
                    textFormat: {
                      bold: true,
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                    },
                    horizontalAlignment: "CENTER",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
              },
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: 0,
                  dimension: "COLUMNS",
                  startIndex: 0,
                  endIndex: headers.length,
                },
              },
            },
          ],
        },
      });
      
      const timestamp = new Date().toISOString();
      return {
        success: true,
        playersExported: sortedEvaluations.length,
        timestamp,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${args.spreadsheetId}`,
      };
    } catch (error) {
      console.error("Google Sheets API error:", error);
      throw new ConvexError({
        message: `Failed to export holistic scores to Google Sheets: ${error instanceof Error ? error.message : "Unknown error"}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
  },
});

// Export all data to Google Sheets
export const exportAllToSheets = action({
  args: { spreadsheetId: v.string() },
  handler: async (ctx, args): Promise<{
    success: boolean;
    results: {
      players?: { playersExported: number };
      archived?: { playersExported: number };
      rejected?: { playersExported: number };
      reEvaluations?: { playersExported: number };
      holisticScores?: { playersExported: number };
    };
    errors: string[];
    timestamp: string;
    spreadsheetUrl: string;
  }> => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const results: {
      players?: { playersExported: number };
      archived?: { playersExported: number };
      rejected?: { playersExported: number };
      reEvaluations?: { playersExported: number };
      holisticScores?: { playersExported: number };
    } = {};
    const errors: string[] = [];
    
    // Export Players
    try {
      const playersResult = await ctx.runAction(api.googleSheets.exportPlayersToSheets, {
        spreadsheetId: args.spreadsheetId,
      });
      results.players = { playersExported: playersResult.playersExported };
    } catch (error) {
      errors.push(`Players export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    
    // Export Archived Players
    try {
      const archivedResult = await ctx.runAction(api.googleSheets.exportArchivedPlayersToSheets, {
        spreadsheetId: args.spreadsheetId,
      });
      results.archived = { playersExported: archivedResult.playersExported };
    } catch (error) {
      errors.push(`Archived players export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    
    // Export Rejected Players
    try {
      const rejectedResult = await ctx.runAction(api.googleSheets.exportRejectedPlayersToSheets, {
        spreadsheetId: args.spreadsheetId,
      });
      results.rejected = { playersExported: rejectedResult.playersExported };
    } catch (error) {
      errors.push(`Rejected players export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    
    // Export Re-Evaluations
    try {
      const reEvaluationsResult = await ctx.runAction(api.googleSheets.exportReEvaluationsToSheets, {
        spreadsheetId: args.spreadsheetId,
      });
      results.reEvaluations = { playersExported: reEvaluationsResult.playersExported };
    } catch (error) {
      errors.push(`Re-evaluations export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    
    // Export Holistic Scores
    try {
      const holisticScoresResult = await ctx.runAction(api.googleSheets.exportHolisticScoresToSheets, {
        spreadsheetId: args.spreadsheetId,
      });
      results.holisticScores = { playersExported: holisticScoresResult.playersExported };
    } catch (error) {
      errors.push(`Holistic scores export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    
    const timestamp = new Date().toISOString();
    return {
      success: errors.length === 0,
      results,
      errors,
      timestamp,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${args.spreadsheetId}`,
    };
  },
});

// Import player applications from Google Sheets
export const importApplicationsFromSheets = action({
  args: { spreadsheetId: v.string() },
  handler: async (ctx, args): Promise<{
    success: boolean;
    playersImported: number;
    playersUpdated: number;
    errors: string[];
    timestamp: string;
  }> => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    try {
      const sheets = await getGoogleSheetsClient();
      
      // Read data from Applications sheet
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: args.spreadsheetId,
        range: "Applications!A:Z",
      });
      
      const rows = response.data.values;
      if (!rows || rows.length < 2) {
        throw new ConvexError({
          message: "No application data found in Applications sheet",
          code: "NOT_FOUND",
        });
      }
      
      // First row is headers
      const headers = rows[0];
      
      // Google Sheets API truncates trailing empty cells from rows,
      // so rows may be shorter than the header row. Pad them to match.
      const dataRows = rows.slice(1).map(row => {
        const padded = [...row];
        while (padded.length < headers.length) {
          padded.push("");
        }
        return padded;
      });
      
      // Flexible header matching: try exact match first, then common aliases
      const COLUMN_ALIASES: Record<string, string[]> = {
        "discord username": ["discord username", "discord", "discord name", "discord user", "username"],
        "status": ["status", "membership status", "member status", "app status", "application status"],
        "comments": ["comments", "admin comments", "notes", "comment"],
        "third party experience": ["third party experience", "3rd party experience"],
        "third party performance": ["third party performance", "3rd party performance"],
        "in-game tourney performance": ["in-game tourney performance", "in game tourney performance", "tourney performance"],
        "official earnings": ["official earnings", "earnings"],
        "ranked performance": ["ranked performance", "ranked"],
        "hours played": ["hours played", "hours"],
        "notoriety/teammates": ["notoriety/teammates", "notoriety", "teammates"],
        "age": ["age"],
        "gender": ["gender"],
        "ability": ["ability"],
        "region": ["region"],
        "game sense": ["game sense", "gamesense"],
        "season performance": ["season performance", "season"],
        "modifiers": ["modifiers", "modifier"],
      };
      
      // Build a header index map with alias support
      const headerIndexMap = new Map<string, number>();
      const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
      
      for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
        for (const alias of aliases) {
          const idx = normalizedHeaders.indexOf(alias);
          if (idx >= 0) {
            headerIndexMap.set(canonical, idx);
            break;
          }
        }
      }
      
      // Helper to get column value by canonical header name
      const getColumnValue = (row: string[], headerName: string): string => {
        const canonical = headerName.toLowerCase().trim();
        const index = headerIndexMap.get(canonical);
        if (index !== undefined && index < row.length) {
          return (row[index] || "").trim();
        }
        // Fallback: direct header match
        const directIndex = normalizedHeaders.indexOf(canonical);
        if (directIndex >= 0 && directIndex < row.length) {
          return (row[directIndex] || "").trim();
        }
        return "";
      };
      
      // Helper to parse number or return undefined
      const parseNumber = (value: string): number | undefined => {
        const num = parseFloat(value);
        return isNaN(num) ? undefined : num;
      };
      
      // Generate unique timestamp for placeholder IDs
      const importTimestamp = Date.now();
      
      // Log detected headers for debugging
      console.log("Detected headers:", JSON.stringify(normalizedHeaders));
      console.log("Resolved column mappings:", JSON.stringify(Object.fromEntries(headerIndexMap)));
      
      // Parse player data from rows - only import rows with a Status value
      const playersData = dataRows
        .filter(row => {
          // Filter out completely empty rows
          if (!row.some(cell => cell && cell.trim())) return false;
          // MUST have a Status value - skip null/empty status
          const statusValue = getColumnValue(row, "status").toLowerCase().trim();
          if (!statusValue) return false;
          // Only import "accepted" or "rejected" statuses
          if (statusValue !== "accepted" && statusValue !== "rejected") return false;
          return true;
        })
        .map((row) => {
          const discordUsername = getColumnValue(row, "discord username");
          // Generate unique placeholder ID for each player
          const randomString = Math.random().toString(36).substring(2, 11);
          const placeholderId = `placeholder_${importTimestamp}_${randomString}`;
          
          // Parse status from Status column
          const statusValue = getColumnValue(row, "status").toLowerCase().trim();
          const playerStatus: "active" | "rejected" | "archived" = statusValue === "rejected" ? "rejected" : "active";
          
          return {
            discordUsername,
            nickname: undefined,
            discordUserId: placeholderId,
            serverJoinDate: new Date().toISOString().split("T")[0],
            // Use Discord Username for Epic Username as well
            epicUsername: discordUsername,
            twitterUsername: undefined,
            twitchUsername: undefined,
            youtubeUsername: undefined,
            // Check for both "Comments" and "Admin Comments" columns
            adminComments: getColumnValue(row, "comments") || undefined,
            status: playerStatus,
            // Evaluation scores - match via alias system
            thirdPartyExperience: parseNumber(getColumnValue(row, "third party experience")),
            thirdPartyPerformance: parseNumber(getColumnValue(row, "third party performance")),
            inGameTourneyPerformance: parseNumber(getColumnValue(row, "in-game tourney performance")),
            officialEarnings: parseNumber(getColumnValue(row, "official earnings")),
            rankedPerformance: parseNumber(getColumnValue(row, "ranked performance")),
            hoursPlayed: parseNumber(getColumnValue(row, "hours played")),
            notorietyTeammates: parseNumber(getColumnValue(row, "notoriety/teammates")),
            age: parseNumber(getColumnValue(row, "age")),
            gender: parseNumber(getColumnValue(row, "gender")),
            ability: parseNumber(getColumnValue(row, "ability")),
            region: parseNumber(getColumnValue(row, "region")),
            gameSense: parseNumber(getColumnValue(row, "game sense")),
            seasonPerformance: parseNumber(getColumnValue(row, "season performance")),
            modifiers: parseNumber(getColumnValue(row, "modifiers")),
          };
        })
        .filter(player => {
          // Must have at least Discord username
          return player.discordUsername;
        });
      
      if (playersData.length === 0) {
        // Collect debug info about what went wrong
        const statusColIdx = headerIndexMap.get("status");
        const discordColIdx = headerIndexMap.get("discord username");
        const uniqueStatuses: Record<string, number> = {};
        const sampleRows: Array<{ rowNum: number; length: number; discord: string; status: string; firstCells: string[] }> = [];
        
        // Count how many rows pass status filter but fail discord filter
        let passedStatusCount = 0;
        let failedDiscordCount = 0;
        
        for (let i = 0; i < Math.min(dataRows.length, 200); i++) {
          const row = dataRows[i];
          if (!row.some(cell => cell && cell.trim())) continue;
          
          const statusVal = getColumnValue(row, "status").toLowerCase().trim();
          uniqueStatuses[statusVal || "(empty)"] = (uniqueStatuses[statusVal || "(empty)"] || 0) + 1;
          
          if (statusVal === "accepted" || statusVal === "rejected") {
            passedStatusCount++;
            const discordVal = getColumnValue(row, "discord username");
            if (!discordVal) failedDiscordCount++;
          }
          
          if (sampleRows.length < 5) {
            sampleRows.push({
              rowNum: i + 2,
              length: rows[i + 1]?.length ?? 0, // original row length before padding
              discord: getColumnValue(row, "discord username"),
              status: getColumnValue(row, "status"),
              firstCells: row.slice(0, 4),
            });
          }
        }
        
        throw new ConvexError({
          message: `No valid player data found. Only rows with Status = "Accepted" or "Rejected" are imported.\n\nDebug Info:\n- Total rows: ${dataRows.length}\n- Headers found: ${JSON.stringify(normalizedHeaders)}\n- Status column index: ${statusColIdx ?? "NOT FOUND"}\n- Discord column index: ${discordColIdx ?? "NOT FOUND"}\n- Rows passing status filter: ${passedStatusCount}\n- Rows failing discord filter: ${failedDiscordCount}\n- Unique status values: ${JSON.stringify(uniqueStatuses)}\n- Sample rows: ${JSON.stringify(sampleRows)}`,
          code: "BAD_REQUEST",
        });
      }
      
      // Import players using bulk create mutation
      const result = await ctx.runMutation(api.players.bulkCreatePlayers, {
        players: playersData,
        updateExisting: true,
      });
      
      // Clear imported rows from the Applications sheet (keep header row)
      try {
        // Find which rows were imported (had Accepted/Rejected status)
        const rowIndicesToClear: number[] = [];
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          if (!row.some(cell => cell && cell.trim())) continue;
          const statusValue = getColumnValue(row, "status").toLowerCase().trim();
          if (statusValue === "accepted" || statusValue === "rejected") {
            rowIndicesToClear.push(i + 2); // +2 because row 1 is header, data starts at row 2
          }
        }
        
        if (rowIndicesToClear.length > 0) {
          // Clear the content of imported rows (in reverse to avoid shifting issues if deleting)
          const clearRequests = rowIndicesToClear.map(rowNum => ({
            deleteDimension: {
              range: {
                sheetId: 0, // Default first sheet - we'll look up the actual sheet ID
                dimension: "ROWS",
                startIndex: rowNum - 1, // 0-based
                endIndex: rowNum,       // exclusive
              },
            },
          }));
          
          // Get the actual sheet ID for "Applications"
          const spreadsheetInfo = await sheets.spreadsheets.get({
            spreadsheetId: args.spreadsheetId,
            fields: "sheets.properties",
          });
          const applicationsSheet = spreadsheetInfo.data.sheets?.find(
            s => s.properties?.title === "Applications"
          );
          const sheetId = applicationsSheet?.properties?.sheetId ?? 0;
          
          // Delete rows in reverse order so indices don't shift
          const sortedRows = [...rowIndicesToClear].sort((a, b) => b - a);
          const deleteRequests = sortedRows.map(rowNum => ({
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS" as const,
                startIndex: rowNum - 1,
                endIndex: rowNum,
              },
            },
          }));
          
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: args.spreadsheetId,
            requestBody: {
              requests: deleteRequests,
            },
          });
          
          console.log(`Deleted ${rowIndicesToClear.length} imported rows from Applications sheet`);
        }
      } catch (clearError) {
        console.error("Failed to clear imported rows from Applications sheet:", clearError);
      }
      
      // Automatically export all players to the Players sheet
      try {
        await ctx.runAction(api.googleSheets.exportPlayersToSheets, {
          spreadsheetId: args.spreadsheetId,
        });
      } catch (exportError) {
        // Log export error but don't fail the import
        console.error("Failed to auto-export to Players sheet:", exportError);
      }
      
      const timestamp = new Date().toISOString();
      return {
        success: true,
        playersImported: result.successCount,
        playersUpdated: result.updatedCount,
        errors: result.errors,
        timestamp,
      };
    } catch (error) {
      console.error("Google Sheets import error:", error);
      throw new ConvexError({
        message: `Failed to import from Google Sheets: ${error instanceof Error ? error.message : "Unknown error"}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
  },
});

// Check application status by cross-referencing Applications sheet with Discord members in DB
export const checkApplicationStatus = action({
  args: { spreadsheetId: v.string() },
  handler: async (ctx, args): Promise<{
    success: boolean;
    totalChecked: number;
    accepted: number;
    notInServer: number;
    errors: string[];
    timestamp: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    try {
      const sheetsClient = await getGoogleSheetsClient();

      // Read the Applications sheet
      const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: args.spreadsheetId,
        range: "Applications!A:Z",
      });

      const rows = response.data.values;
      if (!rows || rows.length < 2) {
        throw new ConvexError({
          message: "No data found in Applications sheet",
          code: "NOT_FOUND",
        });
      }

      const headers = rows[0].map((h: string) => h.toLowerCase().trim());
      const dataRows = rows.slice(1);

      // Find "discord username" column (flexible matching)
      const discordColAliases = ["discord username", "discord", "discord name", "discord user", "username"];
      let discordColIdx = -1;
      for (const alias of discordColAliases) {
        const idx = headers.indexOf(alias);
        if (idx >= 0) {
          discordColIdx = idx;
          break;
        }
      }

      if (discordColIdx < 0) {
        throw new ConvexError({
          message: `Could not find a Discord Username column. Headers found: ${headers.join(", ")}`,
          code: "BAD_REQUEST",
        });
      }

      // Check if "Server Status" column already exists; if not we'll add it
      const statusColName = "server status";
      let statusColIdx = headers.indexOf(statusColName);
      if (statusColIdx < 0) {
        // Add "Server Status" as the last header column
        statusColIdx = headers.length;
      }

      // Get all accepted (in-server) players from the database
      const acceptedPlayers = await ctx.runQuery(
        internal.memberManagement.getAcceptedMemberUsernameLookup,
        {},
      );

      // Build lookup sets for fast matching
      const acceptedUsernamesNormalized = new Set(
        acceptedPlayers.map((p: { discordUsername: string }) => p.discordUsername.toLowerCase().trim())
      );
      const acceptedEpicNormalized = new Set(
        acceptedPlayers.map((p: { epicUsername: string }) => p.epicUsername.toLowerCase().trim())
      );
      const acceptedNicknameNormalized = new Set(
        acceptedPlayers
          .filter((p: { nickname?: string }) => p.nickname)
          .map((p: { nickname?: string }) => (p.nickname as string).toLowerCase().trim())
      );

      let accepted = 0;
      let notInServer = 0;
      const errors: string[] = [];

      // Prepare status values for each row
      const statusValues: string[][] = [];

      // First row: header
      statusValues.push(["Server Status"]);

      for (const row of dataRows) {
        // Pad row to match headers length
        while (row.length < headers.length) {
          row.push("");
        }

        const discordUsername = (row[discordColIdx] || "").trim();

        if (!discordUsername) {
          statusValues.push([""]);
          continue;
        }

        const normalized = discordUsername.toLowerCase().trim();

        // Check if player is in the server (accepted members list)
        const isInServer =
          acceptedUsernamesNormalized.has(normalized) ||
          acceptedEpicNormalized.has(normalized) ||
          acceptedNicknameNormalized.has(normalized);

        if (isInServer) {
          statusValues.push(["Accepted (In Server)"]);
          accepted++;
        } else {
          statusValues.push(["Not In Server"]);
          notInServer++;
        }
      }

      // Write the "Server Status" column back to the sheet
      const colLetter = columnIndexToLetter(statusColIdx);
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: args.spreadsheetId,
        range: `Applications!${colLetter}1:${colLetter}${rows.length}`,
        valueInputOption: "RAW",
        requestBody: {
          values: statusValues,
        },
      });

      // Apply conditional formatting: green for accepted, red for not in server
      // First, get the sheet ID for "Applications"
      const spreadsheetInfo = await sheetsClient.spreadsheets.get({
        spreadsheetId: args.spreadsheetId,
        fields: "sheets.properties",
      });
      const applicationsSheet = spreadsheetInfo.data.sheets?.find(
        s => s.properties?.title === "Applications"
      );
      const sheetId = applicationsSheet?.properties?.sheetId ?? 0;

      await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId: args.spreadsheetId,
        requestBody: {
          requests: [
            // Format the header cell
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: statusColIdx,
                  endColumnIndex: statusColIdx + 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.6, blue: 0.9 },
                    textFormat: {
                      bold: true,
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                    },
                    horizontalAlignment: "CENTER",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
              },
            },
            // Green for "Accepted (In Server)"
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [{
                    sheetId,
                    startRowIndex: 1,
                    endRowIndex: rows.length,
                    startColumnIndex: statusColIdx,
                    endColumnIndex: statusColIdx + 1,
                  }],
                  booleanRule: {
                    condition: {
                      type: "TEXT_CONTAINS",
                      values: [{ userEnteredValue: "Accepted" }],
                    },
                    format: {
                      backgroundColor: { red: 0.85, green: 0.95, blue: 0.85 },
                      textFormat: {
                        foregroundColor: { red: 0.1, green: 0.5, blue: 0.1 },
                        bold: true,
                      },
                    },
                  },
                },
                index: 0,
              },
            },
            // Red for "Not In Server"
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [{
                    sheetId,
                    startRowIndex: 1,
                    endRowIndex: rows.length,
                    startColumnIndex: statusColIdx,
                    endColumnIndex: statusColIdx + 1,
                  }],
                  booleanRule: {
                    condition: {
                      type: "TEXT_CONTAINS",
                      values: [{ userEnteredValue: "Not In Server" }],
                    },
                    format: {
                      backgroundColor: { red: 0.95, green: 0.85, blue: 0.85 },
                      textFormat: {
                        foregroundColor: { red: 0.7, green: 0.1, blue: 0.1 },
                        bold: true,
                      },
                    },
                  },
                },
                index: 1,
              },
            },
            // Auto-resize the column
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId,
                  dimension: "COLUMNS",
                  startIndex: statusColIdx,
                  endIndex: statusColIdx + 1,
                },
              },
            },
          ],
        },
      });

      return {
        success: true,
        totalChecked: accepted + notInServer,
        accepted,
        notInServer,
        errors,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Check application status error:", error);
      throw new ConvexError({
        message: `Failed to check application status: ${error instanceof Error ? error.message : "Unknown error"}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
  },
});

// Helper to convert a 0-based column index to a spreadsheet letter (0=A, 25=Z, 26=AA)
function columnIndexToLetter(index: number): string {
  let letter = "";
  let i = index;
  while (i >= 0) {
    letter = String.fromCharCode((i % 26) + 65) + letter;
    i = Math.floor(i / 26) - 1;
  }
  return letter;
}

// Log an event ban to the Mod Log spreadsheet ("Event Bans" sheet)
export const logBanToModLog = action({
  args: {
    playerTag: v.string(),
    discordId: v.string(),
    banType: v.string(),
    originalEvents: v.number(),
    reason: v.string(),
    moderatorTag: v.string(),
    messageId: v.string(),
    offenseTrack: v.optional(v.string()),
    offenseNumber: v.optional(v.number()),
    date: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const MOD_LOG_SPREADSHEET_ID = "1K5BcAIM-Of9buZVmBzdtGRvjJO2XP9ZAPbFIzE5j1ZM";
    const SHEET_NAME = "Event Bans";

    try {
      const sheetsClient = await getGoogleSheetsClient();

      // Column order must match sync: Discord ID, Player Tag, Ban Type, Original Events, Remaining Events, Start Date, Last Updated, Reason, Moderator Tag, Message ID, Status
      const status = args.originalEvents === 0 ? "ENDED" : "ACTIVE";

      const row = [
        args.discordId,          // A: Discord ID
        args.playerTag,          // B: Player Tag
        args.banType,            // C: Ban Type
        String(args.originalEvents), // D: Original Events
        String(args.originalEvents), // E: Remaining Events (same as original at creation)
        args.date,               // F: Start Date
        args.date,               // G: Last Updated
        args.reason,             // H: Reason
        args.moderatorTag,       // I: Moderator Tag
        args.messageId,          // J: Message ID
        status,                  // K: Status
      ];

      await sheetsClient.spreadsheets.values.append({
        spreadsheetId: MOD_LOG_SPREADSHEET_ID,
        range: `'${SHEET_NAME}'!A:K`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [row],
        },
      });

      return { success: true };
    } catch (error) {
      console.error("Failed to log ban to Mod Log sheet:", error);
      // Don't throw - logging failure shouldn't block the ban itself
      return { success: false };
    }
  },
});

// Update existing players from Google Sheets (Players sheet)
export const updatePlayersFromSheets = action({
  args: { spreadsheetId: v.string() },
  handler: async (ctx, args): Promise<{
    success: boolean;
    playersUpdated: number;
    errors: string[];
    timestamp: string;
  }> => {
    // Check if user is admin
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    try {
      const sheets = await getGoogleSheetsClient();
      
      // Read data from Players sheet
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: args.spreadsheetId,
        range: "Players!A:Z",
      });
      
      const rows = response.data.values;
      if (!rows || rows.length < 2) {
        throw new ConvexError({
          message: "No player data found in Players sheet",
          code: "NOT_FOUND",
        });
      }
      
      // First row is headers
      const headers = rows[0];
      const dataRows = rows.slice(1);
      
      // Helper to get column value by header name
      const getColumnValue = (row: string[], headerName: string): string => {
        const index = headers.findIndex(h => 
          h.toLowerCase().trim() === headerName.toLowerCase().trim()
        );
        return index >= 0 ? (row[index] || "").trim() : "";
      };
      
      // Helper to parse number or return null
      const parseNumber = (value: string): number | null => {
        const num = parseFloat(value);
        return isNaN(num) ? null : num;
      };
      
      let updatedCount = 0;
      const errors: string[] = [];
      
      // Fetch all players once before the loop using lightweight query
      const allPlayers = (await ctx.runQuery(
        api.players.getPlayersForExport,
        {},
      )) as SheetPlayer[];
      
      // Process each row
      for (const row of dataRows) {
        try {
          // Skip empty rows
          if (!row.some(cell => cell && cell.trim())) {
            continue;
          }
          
          const discordUsername = getColumnValue(row, "Discord Username");
          const discordUserId = getColumnValue(row, "Discord ID");
          const statusValue = getColumnValue(row, "Status").toLowerCase();
          const adminComments = getColumnValue(row, "Admin Comments") || getColumnValue(row, "Comments");
          
          if (!discordUsername && !discordUserId) {
            errors.push("Row skipped: No Discord Username or Discord ID");
            continue;
          }
          
          // Find player by Discord ID (preferred) or Discord Username
          const player = discordUserId 
            ? allPlayers.find((p: typeof allPlayers[number]) => p.discordUserId === discordUserId) 
            : allPlayers.find((p: typeof allPlayers[number]) => p.discordUsername === discordUsername);
          
          if (!player) {
            errors.push(`Player not found: ${discordUsername || discordUserId}`);
            continue;
          }
          
          // Parse status
          const playerStatus: "active" | "rejected" | "archived" | undefined = 
            statusValue === "rejected" ? "rejected" : 
            statusValue === "archived" ? "archived" :
            statusValue === "active" ? "active" : undefined;
          
          // Prepare update data
          const updateData: Record<string, string | number | null> = {};
          
          // Add status if provided
          if (playerStatus) {
            updateData.status = playerStatus;
          }
          
          // Add admin comments if provided
          if (adminComments) {
            updateData.adminComments = adminComments;
          }
          
          // Parse evaluation scores
          const scores: Record<string, number | null> = {
            thirdPartyPerformance: parseNumber(getColumnValue(row, "Third Party Performance")),
            inGameTourneyPerformance: parseNumber(getColumnValue(row, "In-Game Tourney Performance")),
            officialEarnings: parseNumber(getColumnValue(row, "Official Earnings")),
            rankedPerformance: parseNumber(getColumnValue(row, "Ranked Performance")),
            hoursPlayed: parseNumber(getColumnValue(row, "Hours Played")),
            thirdPartyExperience: parseNumber(getColumnValue(row, "Third Party Experience")),
            notorietyTeammates: parseNumber(getColumnValue(row, "Notoriety/Teammates")),
            age: parseNumber(getColumnValue(row, "Age")),
            gender: parseNumber(getColumnValue(row, "Gender")),
            ability: parseNumber(getColumnValue(row, "Ability")),
            region: parseNumber(getColumnValue(row, "Region")),
            gameSense: parseNumber(getColumnValue(row, "Game Sense")),
            seasonPerformance: parseNumber(getColumnValue(row, "Season Performance")),
            modifiers: parseNumber(getColumnValue(row, "Modifiers")),
          };
          
          // Update player
          await ctx.runMutation(api.players.updatePlayerFromSheet, {
            playerId: player._id,
            updateData,
            scores,
          });
          
          updatedCount++;
        } catch (error) {
          errors.push(`Error updating player: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
      
      const timestamp = new Date().toISOString();
      return {
        success: errors.length === 0,
        playersUpdated: updatedCount,
        errors,
        timestamp,
      };
    } catch (error) {
      console.error("Google Sheets update error:", error);
      throw new ConvexError({
        message: `Failed to update from Google Sheets: ${error instanceof Error ? error.message : "Unknown error"}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
  },
});
