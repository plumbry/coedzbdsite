import { toPng } from "html-to-image";

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
): Promise<void> {
  const dataUrl = await toPng(element, {
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    cacheBust: true,
  });

  const slug = sanitizeLeaderboardExportFilename(seriesName);
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${slug}-leaderboard.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
