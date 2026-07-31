export function buildMapShareUrl(origin: string, mapId: string): string {
  return `${origin}/maps/${mapId}`;
}

export type SaveAndCopyOutcome =
  | "saved-and-copied"
  | "saved-copy-failed"
  | "copied-only"
  | "copy-failed"
  | "save-failed";

export function getSaveAndCopyToastMessage(outcome: SaveAndCopyOutcome): string {
  switch (outcome) {
    case "saved-and-copied":
      return "Saved — share link copied";
    case "saved-copy-failed":
      return "Saved as a new share link, but it could not be copied";
    case "copied-only":
      return "Link copied";
    case "copy-failed":
      return "Could not copy the link";
    case "save-failed":
      return "Failed to save map";
  }
}

export async function copyMapShareLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
