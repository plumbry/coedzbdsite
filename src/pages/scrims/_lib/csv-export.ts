import Papa from "papaparse";

type Team = {
  teamName: string;
  players: string[];
};

type PairingData = {
  game: number;
  squads: { duo1Index: number; duo2Index: number }[];
  byeTeamIndex?: number;
};

/**
 * Export pairings as a CSV file download.
 * Rows: one per squad per game.
 */
export function exportPairingsToCSV(
  eventName: string,
  pairings: PairingData[],
  teams: Team[],
): void {
  const rows: Record<string, string>[] = [];

  for (const gamePairing of pairings) {
    for (let i = 0; i < gamePairing.squads.length; i++) {
      const squad = gamePairing.squads[i];
      const duo1 = teams[squad.duo1Index];
      const duo2 = teams[squad.duo2Index];
      rows.push({
        "Game": String(gamePairing.game),
        "Squad": String(i + 1),
        "Duo/Team 1": duo1?.teamName ?? "",
        "Duo/Team 1 Players": duo1?.players.join(", ") ?? "",
        "Duo/Team 2": duo2?.teamName ?? "",
        "Duo/Team 2 Players": duo2?.players.join(", ") ?? "",
      });
    }

    if (gamePairing.byeTeamIndex !== undefined) {
      const byeTeam = teams[gamePairing.byeTeamIndex];
      rows.push({
        "Game": String(gamePairing.game),
        "Squad": "BYE",
        "Duo/Team 1": byeTeam?.teamName ?? "",
        "Duo/Team 1 Players": byeTeam?.players.join(", ") ?? "",
        "Duo/Team 2": "",
        "Duo/Team 2 Players": "",
      });
    }
  }

  const csv = Papa.unparse(rows, { quotes: true, header: true });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  // Sanitize filename
  const safeName = eventName.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-");
  link.download = `${safeName}-pairings.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
