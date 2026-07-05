import Papa from "papaparse";
import { zipSync, strToU8 } from "fflate";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import type { YuniteExportScope } from "@/convex/yuniteExport.ts";

export function sanitizeExportFolderName(
  eventName: string,
  importId: string,
): string {
  const base =
    eventName
      .replace(/[^a-z0-9]/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "tournament";
  const suffix = importId.replace(/[^a-z0-9]/gi, "").slice(-8);
  return `${base}_${suffix}`;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return "";
  }
  return Papa.unparse(rows, { quotes: true, header: true });
}

function buildLeaderboardRows(results: Doc<"thirdPartyResults">[]) {
  return [...results]
    .sort((a, b) => a.placement - b.placement)
    .map((result) => ({
      placement: result.placement,
      points: result.points,
      epicUsername: result.epicUsername,
      epicId: result.epicId ?? "",
      discordUsername: result.discordUsername ?? "",
      discordId: result.discordId ?? "",
      teamId: result.teamId ?? "",
      teamName: result.teamName ?? "",
      eliminations: result.eliminations ?? "",
      teamKills: result.teamKills ?? "",
      damage: result.damage ?? "",
      deaths: result.deaths ?? "",
      knocks: result.knocks ?? "",
      wins: result.wins ?? "",
      matchesPlayed: result.matchesPlayed ?? "",
      averagePlacement: result.averagePlacement ?? "",
      averageSecondsSurvived: result.averageSecondsSurvived ?? "",
      matched: result.matched,
      manuallyLinked: result.manuallyLinked ?? false,
    }));
}

function buildMatchStatsRows(
  matchStats: Doc<"matchPlayerStats">[],
  results: Doc<"thirdPartyResults">[],
) {
  const resultByPlayerId = new Map(
    results
      .filter((result) => result.playerId)
      .map((result) => [result.playerId!, result]),
  );
  const resultByDiscordId = new Map(
    results
      .filter((result) => result.discordId)
      .map((result) => [result.discordId!, result]),
  );

  return matchStats.map((matchStat) => {
    const result =
      resultByPlayerId.get(matchStat.playerId) ??
      resultByDiscordId.get(matchStat.discordId);

    return {
      player: result?.epicUsername ?? matchStat.discordId,
      epicUsername: result?.epicUsername ?? "",
      discordUsername: result?.discordUsername ?? "",
      discordId: matchStat.discordId,
      match: matchStat.sessionId,
      score: matchStat.score ?? "",
      placement: matchStat.placement,
      eliminations: matchStat.eliminations,
      knocks: matchStat.knocks,
      deaths: matchStat.deaths,
      teamTotalKills: matchStat.teamTotalKills,
      teamId: matchStat.teamId ?? "",
      duoDiscordId: matchStat.duoDiscordId ?? "",
      teamKillDiscrepancy: matchStat.teamKillDiscrepancy ?? "",
      deathTime: matchStat.deathTime ?? "",
      duoDeathTime: matchStat.duoDeathTime ?? "",
      killsAfterDuoDeath: matchStat.killsAfterDuoDeath ?? "",
      timeAliveAfterDuoDeath: matchStat.timeAliveAfterDuoDeath ?? "",
    };
  });
}

function buildEliminationOverrideRows(
  overrides: Doc<"matchEliminationOverrides">[],
) {
  return overrides.map((override) => ({
    match: override.sessionId,
    discordId: override.discordId,
    eliminations: override.eliminations,
    editedByName: override.editedByName ?? "",
  }));
}

export type YuniteCacheZipInput = {
  scope: YuniteExportScope;
  imports: Doc<"thirdPartyImports">[];
  results: Doc<"thirdPartyResults">[];
  matchStats: Doc<"matchPlayerStats">[];
  eliminationOverrides: Doc<"matchEliminationOverrides">[];
};

export type YuniteCacheZipSummary = {
  tournamentCount: number;
  leaderboardRows: number;
  matchStatRows: number;
  eliminationOverrideRows: number;
  tournamentsWithoutMatchData: number;
};

export function buildYuniteCacheZip(input: YuniteCacheZipInput): {
  blob: Blob;
  summary: YuniteCacheZipSummary;
} {
  const resultsByImport = new Map<string, Doc<"thirdPartyResults">[]>();
  const matchStatsByImport = new Map<string, Doc<"matchPlayerStats">[]>();
  const overridesByImport = new Map<
    string,
    Doc<"matchEliminationOverrides">[]
  >();

  for (const result of input.results) {
    const key = result.importId as string;
    const bucket = resultsByImport.get(key) ?? [];
    bucket.push(result);
    resultsByImport.set(key, bucket);
  }

  for (const matchStat of input.matchStats) {
    const key = matchStat.importId as string;
    const bucket = matchStatsByImport.get(key) ?? [];
    bucket.push(matchStat);
    matchStatsByImport.set(key, bucket);
  }

  for (const override of input.eliminationOverrides) {
    const key = override.importId as string;
    const bucket = overridesByImport.get(key) ?? [];
    bucket.push(override);
    overridesByImport.set(key, bucket);
  }

  const files: Record<string, Uint8Array> = {};
  const tournamentManifests: Array<{
    importId: string;
    eventName: string;
    folder: string;
    eventDate?: string;
    matchDataSynced?: boolean;
    dataFullyCached?: boolean;
    leaderboardRows: number;
    matchStatRows: number;
    eliminationOverrideRows: number;
  }> = [];

  let tournamentsWithoutMatchData = 0;

  for (const importRecord of input.imports) {
    const importId = importRecord._id as string;
    const folder = sanitizeExportFolderName(importRecord.eventName, importId);
    const prefix = `tournaments/${folder}`;

    const importResults = resultsByImport.get(importId) ?? [];
    const importMatchStats = matchStatsByImport.get(importId) ?? [];
    const importOverrides = overridesByImport.get(importId) ?? [];

    if (importMatchStats.length === 0) {
      tournamentsWithoutMatchData += 1;
    }

    files[`${prefix}/tournament.json`] = strToU8(
      JSON.stringify(importRecord, null, 2),
    );
    files[`${prefix}/leaderboard.csv`] = strToU8(
      toCsv(buildLeaderboardRows(importResults)),
    );
    files[`${prefix}/match-stats.csv`] = strToU8(
      toCsv(buildMatchStatsRows(importMatchStats, importResults)),
    );

    if (importOverrides.length > 0) {
      files[`${prefix}/elimination-overrides.csv`] = strToU8(
        toCsv(buildEliminationOverrideRows(importOverrides)),
      );
    }

    tournamentManifests.push({
      importId,
      eventName: importRecord.eventName,
      folder,
      ...(importRecord.eventDate ? { eventDate: importRecord.eventDate } : {}),
      ...(importRecord.tournamentStartedAt
        ? { tournamentStartedAt: importRecord.tournamentStartedAt }
        : {}),
      ...(importRecord.matchDataSynced !== undefined
        ? { matchDataSynced: importRecord.matchDataSynced }
        : {}),
      ...(importRecord.dataFullyCached !== undefined
        ? { dataFullyCached: importRecord.dataFullyCached }
        : {}),
      leaderboardRows: importResults.length,
      matchStatRows: importMatchStats.length,
      eliminationOverrideRows: importOverrides.length,
    });
  }

  const summary: YuniteCacheZipSummary = {
    tournamentCount: input.imports.length,
    leaderboardRows: input.results.length,
    matchStatRows: input.matchStats.length,
    eliminationOverrideRows: input.eliminationOverrides.length,
    tournamentsWithoutMatchData,
  };

  files["manifest.json"] = strToU8(
    JSON.stringify(
      {
        export: {
          timestamp: Date.now(),
          version: "1.0",
          format: "zip-per-tournament",
          scope: input.scope,
          counts: summary,
          tournaments: tournamentManifests,
        },
      },
      null,
      2,
    ),
  );

  const zipped = zipSync(files);
  return {
    blob: new Blob([zipped], { type: "application/zip" }),
    summary,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
