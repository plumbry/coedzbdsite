import Papa from "papaparse";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export type ScrimSeriesGameCsvEntry = {
  /** Raw label from the CSV row (display name or epic). */
  csvLabel: string;
  epicId?: string;
  playerName?: string;
  score: number;
  teamId?: string;
};

export type ScrimSeriesPlayerRef = {
  _id: Id<"scrimSeriesPlayers">;
  playerName: string;
  epicId: string;
};

export type CsvPlayerMatchStatus = "matched" | "suggested" | "unmatched";

export type CsvImportPreviewRow = ScrimSeriesGameCsvEntry & {
  rowIndex: number;
  matchStatus: CsvPlayerMatchStatus;
  /** Auto-matched or staff-selected series player. */
  linkedPlayerId?: Id<"scrimSeriesPlayers">;
  /** Import as a new roster player when no link is chosen. */
  addAsNew?: boolean;
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumnIndex(headers: string[], matchers: ((h: string) => boolean)[]): number {
  for (const match of matchers) {
    const idx = headers.findIndex(match);
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectScoreColumnIndex(headers: string[], rows: string[][], labelIdx: number): number {
  for (let c = 0; c < headers.length; c++) {
    if (c === labelIdx) continue;
    const sample = rows.slice(1, Math.min(rows.length, 8));
    const numericCount = sample.filter((row) => {
      const val = row[c]?.trim() ?? "";
      return val !== "" && !Number.isNaN(Number.parseInt(val, 10));
    }).length;
    if (numericCount >= Math.max(1, sample.length - 1)) {
      return c;
    }
  }
  return -1;
}

/**
 * Parse a CSV for single-game scrim series score import.
 * Accepts Epic Username, Players (display names), or Player columns plus Score/Points.
 */
export function parseScrimSeriesGameCsv(text: string): ScrimSeriesGameCsvEntry[] {
  const parsed = Papa.parse<string[]>(text.trim(), {
    header: false,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message ?? "Failed to parse CSV");
  }

  const rows = parsed.data.filter((row) => row.some((cell) => cell?.trim()));
  if (rows.length < 2) {
    throw new Error("CSV must have a header row and at least one data row");
  }

  const headers = rows[0].map(normalizeHeader);

  const epicIdx = findColumnIndex(headers, [
    (h) => h.includes("epic"),
    (h) => h === "username",
    (h) => h === "player",
  ]);
  const nameIdx = findColumnIndex(headers, [
    (h) => h === "players",
    (h) => h.includes("playername"),
    (h) => h === "name" || h === "displayname",
  ]);
  let scoreIdx = findColumnIndex(headers, [
    (h) => h.includes("score"),
    (h) => h.includes("point"),
  ]);
  const teamIdIdx = findColumnIndex(headers, [
    (h) => h.includes("teamid"),
    (h) => h === "team",
  ]);

  const labelIdx = epicIdx !== -1 ? epicIdx : nameIdx;
  if (labelIdx === -1) {
    throw new Error(
      "CSV must have an Epic Username, Players, or Player Name column",
    );
  }

  if (scoreIdx === -1) {
    scoreIdx = detectScoreColumnIndex(headers, rows, labelIdx);
  }
  if (scoreIdx === -1) {
    throw new Error("CSV must have a Score or Points column");
  }

  const entries: ScrimSeriesGameCsvEntry[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i].map((v) => v.trim().replace(/^"|"$/g, ""));
    const csvLabel = values[labelIdx];
    if (!csvLabel) continue;

    const score = Number.parseInt(values[scoreIdx] ?? "", 10);
    if (Number.isNaN(score)) continue;

    const epicId = epicIdx !== -1 ? csvLabel : undefined;
    const playerName =
      nameIdx !== -1 && nameIdx !== epicIdx
        ? values[nameIdx] || (epicIdx === -1 ? csvLabel : undefined)
        : epicIdx === -1
          ? csvLabel
          : undefined;

    entries.push({
      csvLabel,
      epicId,
      playerName,
      score,
      teamId: teamIdIdx !== -1 ? values[teamIdIdx] || undefined : undefined,
    });
  }

  if (entries.length === 0) {
    throw new Error("No valid score rows found in CSV");
  }

  return entries;
}

function findPlayersByLabel(
  players: ScrimSeriesPlayerRef[],
  label: string,
): ScrimSeriesPlayerRef[] {
  const norm = normalizeName(label);
  return players.filter((player) => {
    const nameNorm = normalizeName(player.playerName);
    const epicNorm = normalizeName(player.epicId);
    return nameNorm === norm || epicNorm === norm;
  });
}

/** Match CSV rows to existing series players (from Yunite or manual roster). */
export function buildCsvImportPreview(
  entries: ScrimSeriesGameCsvEntry[],
  players: ScrimSeriesPlayerRef[],
): CsvImportPreviewRow[] {
  return entries.map((entry, index) => {
    const label = entry.playerName || entry.epicId || entry.csvLabel;

    if (entry.epicId) {
      const byEpic = players.find(
        (p) => normalizeName(p.epicId) === normalizeName(entry.epicId!),
      );
      if (byEpic) {
        return {
          ...entry,
          rowIndex: index,
          matchStatus: "matched",
          linkedPlayerId: byEpic._id,
        };
      }
    }

    const exactMatches = findPlayersByLabel(players, label);
    if (exactMatches.length === 1) {
      return {
        ...entry,
        rowIndex: index,
        matchStatus: "matched",
        linkedPlayerId: exactMatches[0]._id,
      };
    }
    if (exactMatches.length > 1) {
      return {
        ...entry,
        rowIndex: index,
        matchStatus: "unmatched",
      };
    }

    const norm = normalizeName(label);
    const fuzzyMatches = players.filter((player) => {
      const nameNorm = normalizeName(player.playerName);
      return (
        nameNorm.includes(norm) ||
        norm.includes(nameNorm) ||
        normalizeName(player.epicId).includes(norm) ||
        norm.includes(normalizeName(player.epicId))
      );
    });

    if (fuzzyMatches.length === 1) {
      return {
        ...entry,
        rowIndex: index,
        matchStatus: "suggested",
        linkedPlayerId: fuzzyMatches[0]._id,
      };
    }

    return {
      ...entry,
      rowIndex: index,
      matchStatus: "unmatched",
    };
  });
}

export function scrimSeriesGameCsvTemplate(): string {
  return Papa.unparse(
    [
      { Players: "PlayerOne", Points: 42 },
      { Players: "PlayerTwo", Points: 42 },
    ],
    { header: true },
  );
}
