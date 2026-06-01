import type { Id } from "../_generated/dataModel.d.ts";

export type PlayerMatchFields = {
  _id: Id<"players">;
  discordUserId?: string;
  alternateDiscordUserIds?: string[];
  epicId?: string;
  epicUsername?: string;
  discordUsername?: string;
};

export type ImportIdentityInput = {
  discordId?: string | null;
  epicId?: string | null;
  epicUsername?: string | null;
  discordUsername?: string | null;
};

export type ImportMatchMethod =
  | "discord_id"
  | "alternate_discord_id"
  | "epic_id"
  | "epic_username"
  | "discord_username";

export function normalizeDiscordId(id: string): string {
  return id.trim().replace(/['"]/g, "");
}

/**
 * Import matching priority (fuzzy matching is intentionally excluded — review-only).
 * Discord ID → alternate Discord ID → Epic ID → Epic username → Discord username.
 */
export function matchPlayerForImport(
  players: PlayerMatchFields[],
  input: ImportIdentityInput,
): { player: PlayerMatchFields | null; matchMethod: ImportMatchMethod | null } {
  if (input.discordId) {
    const cleanDiscordId = normalizeDiscordId(input.discordId);
    const byDiscordId = players.find(
      (player) =>
        player.discordUserId &&
        normalizeDiscordId(player.discordUserId) === cleanDiscordId,
    );
    if (byDiscordId) {
      return { player: byDiscordId, matchMethod: "discord_id" };
    }

    const byAlternateDiscordId = players.find((player) =>
      player.alternateDiscordUserIds?.some(
        (alternateId) => normalizeDiscordId(alternateId) === cleanDiscordId,
      ),
    );
    if (byAlternateDiscordId) {
      return { player: byAlternateDiscordId, matchMethod: "alternate_discord_id" };
    }
  }

  if (input.epicId) {
    const cleanEpicId = input.epicId.trim();
    const byEpicId = players.find(
      (player) => player.epicId && player.epicId.trim() === cleanEpicId,
    );
    if (byEpicId) {
      return { player: byEpicId, matchMethod: "epic_id" };
    }
  }

  if (input.epicUsername) {
    const normalizedEpicUsername = input.epicUsername.toLowerCase();
    const byEpicUsername = players.find(
      (player) =>
        player.epicUsername &&
        player.epicUsername.toLowerCase() === normalizedEpicUsername,
    );
    if (byEpicUsername) {
      return { player: byEpicUsername, matchMethod: "epic_username" };
    }
  }

  if (input.discordUsername) {
    const normalizedDiscordUsername = input.discordUsername.toLowerCase();
    const byDiscordUsername = players.find(
      (player) =>
        player.discordUsername &&
        player.discordUsername.toLowerCase() === normalizedDiscordUsername,
    );
    if (byDiscordUsername) {
      return { player: byDiscordUsername, matchMethod: "discord_username" };
    }
  }

  return { player: null, matchMethod: null };
}
