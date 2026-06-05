export type OffenseTrack = "minor" | "major" | "probation";
export type PenaltyKind = "warning" | "event_ban";

export const OFFENSE_TRACK_LABELS: Record<OffenseTrack, string> = {
  minor: "Minor",
  major: "Major",
  probation: "Probation",
};

export const PENALTY_KIND_LABELS: Record<PenaltyKind, string> = {
  warning: "Warning",
  event_ban: "Event ban",
};

export function resolveBanType(track: OffenseTrack, kind: PenaltyKind): string {
  if (track === "probation") return "Probation";
  const prefix = track === "minor" ? "Minor" : "Major";
  return kind === "warning" ? `${prefix} Warning` : `${prefix} Event Ban`;
}

export function parseBanToForm(
  banType: string,
  offenseTrack?: string,
): { track: OffenseTrack; kind: PenaltyKind | null } {
  if (banType === "Probation" || offenseTrack === "probation") {
    return { track: "probation", kind: null };
  }

  const lower = banType.toLowerCase();
  let track: OffenseTrack =
    offenseTrack === "major" ? "major" : offenseTrack === "minor" ? "minor" : "minor";
  if (lower.startsWith("major")) track = "major";
  else if (lower.startsWith("minor")) track = "minor";

  const kind: PenaltyKind = lower.includes("warning") ? "warning" : "event_ban";
  return { track, kind };
}

export function defaultEventsFor(track: OffenseTrack, kind: PenaltyKind): number {
  if (track === "probation" || kind === "warning") return 0;
  if (track === "minor") return 1;
  return 3;
}

export function showsPenaltyKind(track: OffenseTrack): boolean {
  return track !== "probation";
}

export function showsEventCount(track: OffenseTrack, kind: PenaltyKind | null): boolean {
  return track !== "probation" && kind === "event_ban";
}

export function syncsDiscordRole(banType: string): boolean {
  return (
    banType === "Minor Event Ban" ||
    banType === "Major Event Ban" ||
    banType === "Event Ban" ||
    banType === "Probation"
  );
}

/** Discord role name applied for event-ban penalties (minor/major share one role). */
export function getDiscordRoleLabel(banType: string): string | null {
  if (banType === "Probation") return "Probation";
  if (syncsDiscordRole(banType) && banType !== "Probation") return "Event Ban";
  return null;
}
