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
 * Format pairings as Discord-friendly text with markdown formatting.
 */
export function formatPairingsForDiscord(
  eventName: string,
  pairings: PairingData[],
  teams: Team[],
): string {
  const lines: string[] = [];

  lines.push(`# ${eventName} - Squad Pairings`);
  lines.push("");

  for (const gamePairing of pairings) {
    lines.push(`## Game ${gamePairing.game}`);
    lines.push("```");

    for (let i = 0; i < gamePairing.squads.length; i++) {
      const squad = gamePairing.squads[i];
      const duo1 = teams[squad.duo1Index];
      const duo2 = teams[squad.duo2Index];
      const duo1Players = duo1?.players.join(" & ") ?? "???";
      const duo2Players = duo2?.players.join(" & ") ?? "???";
      lines.push(
        `Squad ${i + 1}: ${duo1?.teamName ?? "?"} (${duo1Players}) + ${duo2?.teamName ?? "?"} (${duo2Players})`
      );
    }

    lines.push("```");

    if (gamePairing.byeTeamIndex !== undefined) {
      const byeTeam = teams[gamePairing.byeTeamIndex];
      lines.push(`> **Bye:** ${byeTeam?.teamName ?? "?"} sits out`);
    }

    lines.push("");
  }

  return lines.join("\n");
}
