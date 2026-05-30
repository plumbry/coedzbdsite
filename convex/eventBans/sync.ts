"use node";

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import type { ActionCtx } from "../_generated/server";
import { sheets } from "@googleapis/sheets";
import { JWT } from "google-auth-library";

const SPREADSHEET_ID = "1K5BcAIM-Of9buZVmBzdtGRvjJO2XP9ZAPbFIzE5j1ZM";
const SHEET_NAME = "Event Bans";

// Helper to authenticate with Google Sheets (read-only)
async function getGoogleSheetsClient() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;

  if (!credentials) {
    throw new ConvexError({
      message: "GOOGLE_SERVICE_ACCOUNT_CREDENTIALS not configured.",
      code: "NOT_IMPLEMENTED",
    });
  }

  let serviceAccountKey;
  try {
    serviceAccountKey = JSON.parse(credentials);
  } catch {
    throw new ConvexError({
      message: "Invalid GOOGLE_SERVICE_ACCOUNT_CREDENTIALS format.",
      code: "BAD_REQUEST",
    });
  }

  const auth = new JWT({
    email: serviceAccountKey.client_email,
    key: serviceAccountKey.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return sheets({ version: "v4", auth });
}

// Public action for manual sync (admin only)
export const syncEventBans = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; imported: number; updated: number; errors: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    return await performSync(ctx);
  },
});

// Internal action for cron job
export const syncEventBansInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; imported: number; updated: number; errors: number }> => {
    return await performSync(ctx);
  },
});

async function performSync(ctx: ActionCtx): Promise<{ success: boolean; imported: number; updated: number; errors: number }> {
  const sheetsClient = await getGoogleSheetsClient();

  // Read all data from the Event Bans tab
  let rows: string[][] | null | undefined;
  try {
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A:K`, // Columns A through K, quoted sheet name
    });
    rows = response.data.values as string[][] | null | undefined;
    console.log(`Google Sheets returned ${rows?.length ?? 0} rows`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Google Sheets API error:", errorMsg);
    throw new ConvexError({
      message: `Failed to read Google Sheet: ${errorMsg}`,
      code: "EXTERNAL_SERVICE_ERROR",
    });
  }

  if (!rows || rows.length < 2) {
    console.log("No data rows found in sheet");
    return { success: true, imported: 0, updated: 0, errors: 0 };
  }

  // Parse all data rows (skip header at index 0)
  const bans: Array<{
    discordId: string;
    playerTag: string;
    banType: string;
    originalEvents: number;
    remainingEvents: number;
    startDate: string;
    lastUpdated: string;
    reason: string;
    moderatorTag: string;
    messageId: string;
    status: string;
    offenseTrack: string | undefined;
    offenseNumber: number | undefined;
  }> = [];

  let errors = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 9) continue;

    // Columns: Discord ID, Player Tag, Ban Type, Original Events, Remaining Events, Start Date, Last Updated, Reason, Moderator Tag, Message ID, Status
    const discordId = row[0] || "";
    const playerTag = row[1] || "";
    const banType = row[2] || "";
    const originalEvents = row[3] || "0";
    const remainingEvents = row[4] || "0";
    const startDate = row[5] || "";
    const lastUpdated = row[6] || "";
    const reason = row[7] || "";
    const moderatorTag = row[8] || "";
    const messageId = row[9] || `row_${i}`;
    const statusCol = row[10] || "";

    // Skip empty rows
    if (!discordId.trim() || !playerTag.trim()) continue;

    // Parse offense track and number from reason field: "[Minor offense #2] ..." or "[Major offense #1] ..."
    let offenseTrack: string | undefined;
    let offenseNumber: number | undefined;
    const offenseMatch = reason.match(/\[(Minor|Major)\s+offense\s+#(\d+)\]/i);
    if (offenseMatch) {
      offenseTrack = offenseMatch[1].toLowerCase();
      offenseNumber = parseInt(offenseMatch[2], 10);
    } else {
      // Also check banType column for "Minor Event Ban" or "Major Event Ban"
      const banTypeLower = banType.trim().toLowerCase();
      if (banTypeLower.startsWith("minor")) {
        offenseTrack = "minor";
      } else if (banTypeLower.startsWith("major")) {
        offenseTrack = "major";
      }
    }

    try {
      bans.push({
        discordId: discordId.trim(),
        playerTag: playerTag.trim(),
        banType: banType.trim() || "All",
        originalEvents: parseInt(originalEvents, 10) || 0,
        remainingEvents: parseInt(remainingEvents, 10) || 0,
        startDate: startDate.trim(),
        lastUpdated: lastUpdated.trim(),
        reason: reason.trim(),
        moderatorTag: moderatorTag.trim(),
        messageId: messageId.trim(),
        status: statusCol.trim() === "ENDED" ? "ENDED" : "ACTIVE",
        offenseTrack,
        offenseNumber,
      });
    } catch (error) {
      console.error(`Error parsing row ${i}:`, error);
      errors++;
    }
  }

  console.log(`Parsed ${bans.length} bans from sheet (${bans.filter(b => b.status === "ACTIVE").length} active, ${bans.filter(b => b.status === "ENDED").length} ended)`);

  // Batch upsert all bans in a single mutation call
  if (bans.length > 0) {
    const result = await ctx.runMutation(
      internal.eventBans.mutations.batchUpsertBans,
      { bans }
    );
    return { success: true, imported: result.imported, updated: result.updated, errors };
  }

  return { success: true, imported: 0, updated: 0, errors };
}

// Update bans in Google Sheet to reflect ENDED status (called after eventPassed)
export const updateSheetBansToEnded = internalAction({
  args: {
    bans: v.array(
      v.object({
        discordId: v.string(),
        messageId: v.string(),
        startDate: v.string(),
      })
    ),
  },
  handler: async (_ctx, args): Promise<{ updated: number }> => {
    if (args.bans.length === 0) return { updated: 0 };

    const sheetsClient = await getGoogleSheetsClient();

    // Read all rows from the sheet
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A:K`,
    });
    const rows = response.data.values as string[][] | null | undefined;

    if (!rows || rows.length < 2) return { updated: 0 };

    // Find the row indices that match the ended bans
    const updates: Array<{ rowIndex: number }> = [];

    for (const ban of args.bans) {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const rowDiscordId = (row[0] || "").trim();
        const rowMessageId = (row[9] || "").trim();
        const rowStartDate = (row[5] || "").trim();

        if (
          rowDiscordId === ban.discordId &&
          (rowMessageId === ban.messageId || rowStartDate === ban.startDate)
        ) {
          updates.push({ rowIndex: i });
          break;
        }
      }
    }

    if (updates.length === 0) return { updated: 0 };

    // Build batch update requests to set Remaining Events (col E) to "0" and Status (col K) to "ENDED"
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

    const data = updates.flatMap(({ rowIndex }) => [
      {
        range: `'${SHEET_NAME}'!E${rowIndex + 1}`,
        values: [["0"]],
      },
      {
        range: `'${SHEET_NAME}'!G${rowIndex + 1}`,
        values: [[todayStr]],
      },
      {
        range: `'${SHEET_NAME}'!K${rowIndex + 1}`,
        values: [["ENDED"]],
      },
    ]);

    await sheetsClient.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "RAW",
        data,
      },
    });

    console.log(`Updated ${updates.length} ban rows in sheet to ENDED`);
    return { updated: updates.length };
  },
});

// Update bans in Google Sheet to reflect reactivation after undo (set status back to ACTIVE)
export const updateSheetBansToActive = internalAction({
  args: {
    bans: v.array(
      v.object({
        discordId: v.string(),
        messageId: v.string(),
        startDate: v.string(),
        remainingEvents: v.number(),
      })
    ),
  },
  handler: async (_ctx, args): Promise<{ updated: number }> => {
    if (args.bans.length === 0) return { updated: 0 };

    const sheetsClient = await getGoogleSheetsClient();

    // Read all rows from the sheet
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A:K`,
    });
    const rows = response.data.values as string[][] | null | undefined;

    if (!rows || rows.length < 2) return { updated: 0 };

    // Find the row indices that match the reactivated bans
    const updates: Array<{ rowIndex: number; remainingEvents: number }> = [];

    for (const ban of args.bans) {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const rowDiscordId = (row[0] || "").trim();
        const rowMessageId = (row[9] || "").trim();
        const rowStartDate = (row[5] || "").trim();

        if (
          rowDiscordId === ban.discordId &&
          (rowMessageId === ban.messageId || rowStartDate === ban.startDate)
        ) {
          updates.push({ rowIndex: i, remainingEvents: ban.remainingEvents });
          break;
        }
      }
    }

    if (updates.length === 0) return { updated: 0 };

    // Build batch update requests to set Remaining Events (col E) and Status (col K) to "ACTIVE"
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

    const data = updates.flatMap(({ rowIndex, remainingEvents }) => [
      {
        range: `'${SHEET_NAME}'!E${rowIndex + 1}`,
        values: [[String(remainingEvents)]],
      },
      {
        range: `'${SHEET_NAME}'!G${rowIndex + 1}`,
        values: [[todayStr]],
      },
      {
        range: `'${SHEET_NAME}'!K${rowIndex + 1}`,
        values: [["ACTIVE"]],
      },
    ]);

    await sheetsClient.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "RAW",
        data,
      },
    });

    console.log(`Updated ${updates.length} ban rows in sheet to ACTIVE (undo)`);
    return { updated: updates.length };
  },
});

// Delete a ban from both the database and the Google Sheet
export const deleteBan = action({
  args: { banId: v.id("eventBans") },
  handler: async (ctx, args): Promise<{ success: boolean; removedFromSheet: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    // Get the ban details before deleting (need discordId + messageId to find sheet row)
    const ban = await ctx.runQuery(internal.eventBans.queries.getBanById, { banId: args.banId });
    if (!ban) {
      throw new ConvexError({
        message: "Ban not found",
        code: "NOT_FOUND",
      });
    }

    // If the ban had a Discord role synced, queue removal so the bot picks it up
    const roleSyncBanTypes = [
      "Minor Event Ban",
      "Major Event Ban",
      "Event Ban",
      "Probation",
    ];
    if (ban.syncedToDiscord && !ban.roleRemovedFromDiscord && roleSyncBanTypes.includes(ban.banType)) {
      await ctx.runMutation(internal.eventBans.mutations.queuePendingRoleRemoval, {
        discordId: ban.discordId,
        banType: ban.banType,
      });
    }

    // Delete from database
    await ctx.runMutation(internal.eventBans.mutations.deleteBanById, { banId: args.banId });

    // Try to remove from Google Sheet
    let removedFromSheet = false;
    try {
      const sheetsClient = await getGoogleSheetsClient();

      // Read all rows to find the matching one
      const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${SHEET_NAME}'!A:K`,
      });
      const rows = response.data.values as string[][] | null | undefined;

      if (rows && rows.length > 1) {
        // Find the row matching this ban by discordId + messageId
        let rowIndex = -1;
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;
          const rowDiscordId = (row[0] || "").trim();
          const rowMessageId = (row[9] || "").trim();
          const rowStartDate = (row[5] || "").trim();

          if (
            rowDiscordId === ban.discordId &&
            (rowMessageId === ban.messageId || rowStartDate === ban.startDate)
          ) {
            rowIndex = i;
            break;
          }
        }

        if (rowIndex >= 0) {
          // Get the sheet ID for the delete request
          const spreadsheet = await sheetsClient.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
          });
          const sheet = spreadsheet.data.sheets?.find(
            (s) => s.properties?.title === SHEET_NAME
          );
          const sheetId = sheet?.properties?.sheetId ?? 0;

          // Delete the row
          await sheetsClient.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId,
                      dimension: "ROWS",
                      startIndex: rowIndex,
                      endIndex: rowIndex + 1,
                    },
                  },
                },
              ],
            },
          });
          removedFromSheet = true;
          console.log(`Deleted row ${rowIndex + 1} from sheet for ban ${ban.playerTag}`);
        } else {
          console.log(`Could not find matching row in sheet for ban ${ban.playerTag} (messageId: ${ban.messageId})`);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to delete from sheet:", errorMsg);
      // Don't throw - ban was already deleted from DB
    }

    return { success: true, removedFromSheet };
  },
});

// Delete all offense records for a player from both DB and Google Sheet
export const deletePlayerOffenses = action({
  args: {
    discordId: v.string(),
    track: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ deleted: number; removedFromSheet: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }

    // Delete from database
    const result = await ctx.runMutation(internal.eventBans.mutations.deletePlayerOffensesInternal, {
      discordId: args.discordId,
      track: args.track,
    });

    // Try to remove matching rows from Google Sheet
    let removedFromSheet = 0;
    try {
      const sheetsClient = await getGoogleSheetsClient();

      const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${SHEET_NAME}'!A:K`,
      });
      const rows = response.data.values as string[][] | null | undefined;

      if (rows && rows.length > 1) {
        // Find all rows matching this player's offenses (by discordId and ban type containing minor/major)
        const rowIndicesToDelete: number[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;
          const rowDiscordId = (row[0] || "").trim();
          const rowBanType = (row[2] || "").trim().toLowerCase();

          if (rowDiscordId !== args.discordId) continue;

          // Check if this row has an offense track
          const isMinor = rowBanType.startsWith("minor");
          const isMajor = rowBanType.startsWith("major");
          if (!isMinor && !isMajor) continue;

          // If filtering by track, only delete matching track
          if (args.track === "minor" && !isMinor) continue;
          if (args.track === "major" && !isMajor) continue;

          rowIndicesToDelete.push(i);
        }

        if (rowIndicesToDelete.length > 0) {
          // Get sheet ID
          const spreadsheet = await sheetsClient.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
          });
          const sheet = spreadsheet.data.sheets?.find(
            (s) => s.properties?.title === SHEET_NAME
          );
          const sheetId = sheet?.properties?.sheetId ?? 0;

          // Delete rows in reverse order to preserve indices
          const requests = rowIndicesToDelete
            .sort((a, b) => b - a)
            .map((rowIndex) => ({
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: "ROWS" as const,
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1,
                },
              },
            }));

          await sheetsClient.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: { requests },
          });
          removedFromSheet = rowIndicesToDelete.length;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to delete offenses from sheet:", errorMsg);
    }

    return { deleted: result.deleted, removedFromSheet };
  },
});
