import { toPng } from "html-to-image";

export const SCRIM_SERIES_EXPORT_LIMITS = [50, 75] as const;
export type ScrimSeriesLeaderboardExportLimit = (typeof SCRIM_SERIES_EXPORT_LIMITS)[number];

export type ScrimSeriesLeaderboardExportOptions = {
  showScoringRules: boolean;
  showPlayerCount: boolean;
  showGamesColumn: boolean;
  showParticipationPercent: boolean;
  showPenaltiesColumn: boolean;
};

export const DEFAULT_SCRIM_SERIES_EXPORT_OPTIONS: ScrimSeriesLeaderboardExportOptions = {
  showScoringRules: true,
  showPlayerCount: true,
  showGamesColumn: true,
  showParticipationPercent: true,
  showPenaltiesColumn: true,
};

export function sanitizeLeaderboardExportFilename(seriesName: string): string {
  const slug = seriesName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "scrim-series-leaderboard";
}

export async function downloadScrimSeriesLeaderboardImage(
  element: HTMLElement,
  seriesName: string,
  playerLimit?: number,
): Promise<void> {
  const dataUrl = await toPng(element, {
    backgroundColor: "#ffffff",
    pixelRatio: 3,
    cacheBust: true,
  });

  const slug = sanitizeLeaderboardExportFilename(seriesName);
  const limitSuffix = playerLimit ? `-top-${playerLimit}` : "";
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${slug}-leaderboard${limitSuffix}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
