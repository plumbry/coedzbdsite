import Papa from "papaparse";

export type ScrimSeriesGameCsvEntry = {
  epicId: string;
  playerName?: string;
  score: number;
  teamId?: string;
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumnIndex(headers: string[], matchers: ((h: string) => boolean)[]): number {
  for (const match of matchers) {
    const idx = headers.findIndex(match);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Parse a CSV for single-game scrim series score import.
 * Required columns: Epic Username/ID and Score/Points.
 * Optional: Player Name, Team ID.
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
    (h) => h === "username" || h === "player",
  ]);
  const scoreIdx = findColumnIndex(headers, [
    (h) => h.includes("score"),
    (h) => h.includes("point"),
  ]);
  const nameIdx = findColumnIndex(headers, [
    (h) => h.includes("playername"),
    (h) => h === "name" || h === "displayname",
  ]);
  const teamIdIdx = findColumnIndex(headers, [
    (h) => h.includes("teamid"),
    (h) => h === "team",
  ]);

  if (epicIdx === -1) {
    throw new Error("CSV must have an Epic Username or Epic ID column");
  }
  if (scoreIdx === -1) {
    throw new Error("CSV must have a Score or Points column");
  }

  const entries: ScrimSeriesGameCsvEntry[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i].map((v) => v.trim().replace(/^"|"$/g, ""));
    const epicId = values[epicIdx];
    if (!epicId) continue;

    const score = Number.parseInt(values[scoreIdx] ?? "", 10);
    if (Number.isNaN(score)) continue;

    entries.push({
      epicId,
      playerName: nameIdx !== -1 ? values[nameIdx] || undefined : undefined,
      score,
      teamId: teamIdIdx !== -1 ? values[teamIdIdx] || undefined : undefined,
    });
  }

  if (entries.length === 0) {
    throw new Error("No valid score rows found in CSV");
  }

  return entries;
}

export function scrimSeriesGameCsvTemplate(): string {
  return Papa.unparse(
    [
      { "Epic Username": "PlayerOne", Score: 42, "Team ID": "team-abc" },
      { "Epic Username": "PlayerTwo", Score: 42, "Team ID": "team-abc" },
    ],
    { header: true },
  );
}
