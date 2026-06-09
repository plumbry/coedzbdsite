"use node";

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { sheets } from "@googleapis/sheets";
import { JWT } from "google-auth-library";
import { api } from "../_generated/api";
import type { GenderSheetEntry } from "../helpers/genderSheetEntries";

const MOD_LOG_SPREADSHEET_ID = "1K5BcAIM-Of9buZVmBzdtGRvjJO2XP9ZAPbFIzE5j1ZM";
const SHEET_NAME = "Gender Sheet";
const HEADERS = [
  "Discord ID",
  "Discord Username",
  "Gender",
  "Status",
  "Updated",
] as const;

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

function sheetDiscordId(discordUserId: string): string {
  return `'${discordUserId}`;
}

function entryToRow(entry: GenderSheetEntry, updatedAt: string): string[] {
  return [
    sheetDiscordId(entry.discordUserId),
    entry.discordUsername,
    String(entry.gender),
    entry.status,
    updatedAt,
  ];
}

async function writeGenderSheetRows(entries: GenderSheetEntry[]) {
  const sheetsClient = await getGoogleSheetsClient();
  const updatedAt = new Date().toISOString();
  const values = [
    [...HEADERS],
    ...entries.map((entry) => entryToRow(entry, updatedAt)),
  ];

  try {
    await sheetsClient.spreadsheets.values.clear({
      spreadsheetId: MOD_LOG_SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A:Z`,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new ConvexError({
      message: `Failed to clear "${SHEET_NAME}" sheet: ${errorMsg}`,
      code: "EXTERNAL_SERVICE_ERROR",
    });
  }

  try {
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: MOD_LOG_SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new ConvexError({
      message: `Failed to write "${SHEET_NAME}" sheet: ${errorMsg}`,
      code: "EXTERNAL_SERVICE_ERROR",
    });
  }
}

export const rebuildGenderSheet = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; count: number }> => {
    const entries: GenderSheetEntry[] = await ctx.runQuery(
      internal.genderSheet.queries.listEntries,
      {},
    );

    try {
      await writeGenderSheetRows(entries);
      console.log(`Gender Sheet rebuilt: ${entries.length} row(s)`);
      return { success: true, count: entries.length };
    } catch (error) {
      console.error(
        "Gender Sheet rebuild failed:",
        error instanceof Error ? error.message : error,
      );
      return { success: false, count: 0 };
    }
  },
});

/** Staff manual rebuild from Mod Log Gender Sheet tab. */
export const syncGenderSheet = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; count: number }> => {
    await ctx.runQuery(api.girlRole.queries.assertStaffAccess, {});

    const entries = await ctx.runQuery(internal.genderSheet.queries.listEntries, {});

    try {
      await writeGenderSheetRows(entries);
      console.log(`Gender Sheet manual sync: ${entries.length} row(s)`);
      return { success: true, count: entries.length };
    } catch (error) {
      console.error(
        "Gender Sheet manual sync failed:",
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  },
});
