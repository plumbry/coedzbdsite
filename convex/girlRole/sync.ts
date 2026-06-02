"use node";

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { sheets } from "@googleapis/sheets";
import { JWT } from "google-auth-library";
import { api } from "../_generated/api";

const MOD_LOG_SPREADSHEET_ID = "1K5BcAIM-Of9buZVmBzdtGRvjJO2XP9ZAPbFIzE5j1ZM";
const SHEET_NAME = "Girl Role";

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
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return sheets({ version: "v4", auth });
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim();
}

function parseVerificationMethod(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const upper = value.trim().toUpperCase();
  if (upper === "ID") return "ID";
  if (upper === "FACECAM") return "FACECAM";
  if (upper === "TRUSTED SERVER" || upper === "TRUSTED_SERVER") {
    return "TRUSTED SERVER";
  }
  return value.trim();
}

type ParsedVerification = {
  discordUserId?: string;
  discordUsername?: string;
  verificationMethod?: string;
};

function parseGirlRoleRows(rows: string[][]): ParsedVerification[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  const discordIdIdx = findColumnIndex(headers, [
    "discord id",
    "discord user id",
    "user id",
    "id",
  ]);
  const discordUsernameIdx = findColumnIndex(headers, [
    "discord username",
    "discord",
    "discord name",
    "username",
    "discord tag",
    "player",
    "name",
  ]);
  const methodIdx = findColumnIndex(headers, [
    "verification method",
    "method",
    "verified via",
    "verification",
  ]);

  const verifications: ParsedVerification[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const discordUserId =
      discordIdIdx >= 0 ? (row[discordIdIdx] || "").trim() : "";
    let discordUsername =
      discordUsernameIdx >= 0 ? (row[discordUsernameIdx] || "").trim() : "";
    if (discordUsername.includes("#")) {
      discordUsername = discordUsername.split("#")[0] ?? discordUsername;
    }
    const verificationMethod =
      methodIdx >= 0
        ? parseVerificationMethod(row[methodIdx])
        : undefined;

    if (!discordUserId && !discordUsername) continue;

    verifications.push({
      discordUserId: discordUserId || undefined,
      discordUsername: discordUsername || undefined,
      verificationMethod,
    });
  }

  return verifications;
}

export const syncGirlRole = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; count: number; cleared: number }> => {
    await ctx.runQuery(api.girlRole.queries.assertStaffAccess, {});

    const sheetsClient = await getGoogleSheetsClient();
    let rows: string[][] | null | undefined;
    try {
      const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: MOD_LOG_SPREADSHEET_ID,
        range: `'${SHEET_NAME}'!A:Z`,
      });
      rows = response.data.values as string[][] | null | undefined;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new ConvexError({
        message: `Failed to read "${SHEET_NAME}" sheet: ${errorMsg}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }

    const verifications = parseGirlRoleRows(rows ?? []);
    const result = await ctx.runMutation(internal.girlRole.mutations.replaceAllVerifications, {
      verifications,
    });

    console.log(
      `Girl Role sync: ${result.inserted} verifications (cleared ${result.cleared} previous)`,
    );

    return {
      success: true,
      count: result.inserted,
      cleared: result.cleared,
    };
  },
});

export const syncGirlRoleInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; count: number; cleared: number }> => {
    const sheetsClient = await getGoogleSheetsClient();
    let rows: string[][] | null | undefined;
    try {
      const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: MOD_LOG_SPREADSHEET_ID,
        range: `'${SHEET_NAME}'!A:Z`,
      });
      rows = response.data.values as string[][] | null | undefined;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Girl Role sync failed: ${errorMsg}`);
      throw new ConvexError({
        message: `Failed to read "${SHEET_NAME}" sheet: ${errorMsg}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }

    const verifications = parseGirlRoleRows(rows ?? []);
    const result = await ctx.runMutation(internal.girlRole.mutations.replaceAllVerifications, {
      verifications,
    });

    console.log(
      `Girl Role sync: ${result.inserted} verifications (cleared ${result.cleared} previous)`,
    );

    return {
      success: true,
      count: result.inserted,
      cleared: result.cleared,
    };
  },
});
