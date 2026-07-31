export function buildMapShareUrl(origin: string, mapId: string): string {
  return `${origin}/maps/${mapId}`;
}

export type SaveAndCopyOutcome =
  | "saved-and-copied"
  | "saved-copy-failed"
  | "copied-only"
  | "conflict"
  | "save-failed";

export function getSaveAndCopyToastMessage(outcome: SaveAndCopyOutcome): string {
  switch (outcome) {
    case "saved-and-copied":
      return "Saved and link copied";
    case "saved-copy-failed":
      return "Saved, but the link could not be copied";
    case "copied-only":
      return "Saved and link copied";
    case "conflict":
      return "This shared map changed elsewhere. Reload from the server before saving again.";
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
