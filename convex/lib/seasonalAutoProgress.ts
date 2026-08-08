import type { Doc } from "../_generated/dataModel.d.ts";

type QualificationRule = NonNullable<Doc<"seasonalQuests">["qualificationRule"]>;
type TeamFormat = "duos" | "trios" | "squads";

const TEAM_FORMAT_LABELS: Record<TeamFormat, string> = {
  duos: "Duos",
  trios: "Trios",
  squads: "Squads",
};

export function formatQualificationRule(rule: QualificationRule): string {
  switch (rule.type) {
    case "play_events":
      return `Play ${rule.count} Summer Slam scrim${rule.count === 1 ? "" : "s"}`;
    case "play_all_team_formats":
      return "Play Duos, Trios, and Squads events";
    case "reach_top_5":
      return "Finish Top 5 as a team on a tagged Summer Slam overall Yunite leaderboard";
    case "reach_top_3":
      return "Finish Top 3 as a team on a tagged Summer Slam overall Yunite leaderboard";
    case "reach_top_10":
      return "Finish Top 10 as a team on a tagged Summer Slam overall Yunite leaderboard";
    case "win_game":
      return "Win an individual match in a tagged Summer Slam scrim";
    case "play_event_type":
      return "Play a Showdown Summer Slam event";
    case "distinct_teammates":
      return `Play with ${rule.count} different teammates during Summer Slam`;
    case "new_member_teammate":
      return `Play with a teammate who has fewer than ${rule.maxEvents} Yunite events`;
    case "new_teammates":
      return `Team with ${rule.count} unique player${rule.count === 1 ? "" : "s"} with no prior Yunite coplay across Summer Slam scrims (excludes Squad Shuffle, Random Squads, Random Trios)`;
    case "play_team_format":
      return `Play a ${rule.teamFormat} event (legacy)`;
    case "reach_top":
      return `Reach top ${rule.placement} in ${rule.eventCount ?? 1} event${(rule.eventCount ?? 1) === 1 ? "" : "s"}${rule.teamFormat ? ` (${rule.teamFormat})` : ""} (legacy)`;
    default:
      return "Auto-tracked quest";
  }
}

/** Target progress count for an auto quest rule (defaults to 1). */
export function questProgressTarget(rule: QualificationRule | undefined): number {
  if (!rule) return 1;
  switch (rule.type) {
    case "play_events":
    case "distinct_teammates":
    case "new_teammates":
      return rule.count;
    case "play_all_team_formats":
      return 3;
    case "reach_top":
      return rule.eventCount ?? 1;
    default:
      return 1;
  }
}

export function formatAutoProgressSummary(
  rule: QualificationRule,
  current: number,
  target: number,
  options?: { formatsPlayed?: TeamFormat[] },
): string | undefined {
  if (current <= 0 || current >= target) return undefined;

  switch (rule.type) {
    case "play_events":
      return `Played ${current} of ${target} Summer Slam scrim${target === 1 ? "" : "s"}`;
    case "play_all_team_formats": {
      const allFormats: TeamFormat[] = ["duos", "trios", "squads"];
      const played = new Set(options?.formatsPlayed ?? []);
      const missing = allFormats.filter((format) => !played.has(format));
      const playedLabels = allFormats
        .filter((format) => played.has(format))
        .map((format) => TEAM_FORMAT_LABELS[format]);
      const parts = [`${current} of ${target} team formats played`];
      if (playedLabels.length > 0) {
        parts.push(`(${playedLabels.join(", ")})`);
      }
      if (missing.length > 0) {
        parts.push(`still need ${missing.map((format) => TEAM_FORMAT_LABELS[format]).join(", ")}`);
      }
      return parts.join(" — ");
    }
    case "distinct_teammates":
      return `${current} of ${target} different teammates`;
    case "new_teammates":
      return `${current} of ${target} never-played-with teammate${target === 1 ? "" : "s"}`;
    default:
      return `${current} of ${target} criteria met`;
  }
}
