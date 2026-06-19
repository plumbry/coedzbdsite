import {
  getQuestStatus,
  type QuestCategory,
  type QuestEntry,
} from "./passport-types.ts";

/**
 * Seal model for the Summer Slam Passport dashboard.
 *
 * Each of the five quest categories maps to one collectible "seal". A seal is
 * earned when every quest in its category is approved. The official seal PNG
 * assets live in /public/summer-slam/seals and are the production artwork —
 * never recreate or replace them.
 */

export type SealState = "locked" | "in_progress" | "submitted" | "earned";

export const SEAL_ORDER: QuestCategory[] = [
  "traveller",
  "competitor",
  "summer_spirit",
  "team_player",
  "community",
];

export type SealMeta = {
  id: QuestCategory;
  label: string;
  title: string;
  tagline: string;
  /** Public path to the official transparent PNG. */
  image: string;
  /** Primary brand hex for routes, rings and progress. */
  accent: string;
  /** Soft tint (light background) hex. */
  tint: string;
  /** Tailwind classes for the seal's coloured glow when active. */
  glow: string;
  /** Tailwind text colour matching the accent. */
  text: string;
};

export const SEAL_META: Record<QuestCategory, SealMeta> = {
  traveller: {
    id: "traveller",
    label: "Traveller",
    title: "Traveller Seal",
    tagline: "Explore every mode and chart your summer journey.",
    image: "/summer-slam/seals/traveller.png",
    accent: "#0ea5e9",
    tint: "#e0f2fe",
    glow: "shadow-[0_10px_40px_-8px_rgba(14,165,233,0.55)]",
    text: "text-sky-600",
  },
  competitor: {
    id: "competitor",
    label: "Competitor",
    title: "Competitor Seal",
    tagline: "Climb the leaderboard and claim victory royales.",
    image: "/summer-slam/seals/competitor.png",
    accent: "#f59e0b",
    tint: "#fef3c7",
    glow: "shadow-[0_10px_40px_-8px_rgba(245,158,11,0.55)]",
    text: "text-amber-600",
  },
  summer_spirit: {
    id: "summer_spirit",
    label: "Summer Spirit",
    title: "Summer Spirit Seal",
    tagline: "Soak up the season and share the good vibes.",
    image: "/summer-slam/seals/summer_spirit.png",
    accent: "#f97316",
    tint: "#ffedd5",
    glow: "shadow-[0_10px_40px_-8px_rgba(249,115,22,0.55)]",
    text: "text-orange-600",
  },
  team_player: {
    id: "team_player",
    label: "Team Player",
    title: "Team Player Seal",
    tagline: "Squad up and win it together.",
    image: "/summer-slam/seals/team_player.png",
    accent: "#22c55e",
    tint: "#dcfce7",
    glow: "shadow-[0_10px_40px_-8px_rgba(34,197,94,0.55)]",
    text: "text-green-600",
  },
  community: {
    id: "community",
    label: "Community",
    title: "Community Seal",
    tagline: "Lift up the crew and connect the community.",
    image: "/summer-slam/seals/community.png",
    accent: "#d946ef",
    tint: "#fae8ff",
    glow: "shadow-[0_10px_40px_-8px_rgba(217,70,239,0.55)]",
    text: "text-fuchsia-600",
  },
};

export type SealTask = {
  entry: QuestEntry;
  title: string;
  done: boolean;
  pending: boolean;
  needsFix: boolean;
};

export type SealProgress = {
  id: QuestCategory;
  meta: SealMeta;
  state: SealState;
  entries: QuestEntry[];
  tasks: SealTask[];
  total: number;
  approved: number;
  pending: number;
  needsFix: number;
  remaining: number;
  percent: number;
  stampReward: number;
  earnedAt?: number;
};

export function deriveSeal(category: QuestCategory, entries: QuestEntry[]): SealProgress {
  const meta = SEAL_META[category];
  const tasks: SealTask[] = entries.map((entry) => {
    const status = getQuestStatus(entry);
    return {
      entry,
      title: entry.quest.title,
      done: status === "approved",
      pending: status === "pending_review",
      needsFix: status === "rejected" || status === "needs_more_evidence",
    };
  });

  const total = entries.length;
  const approved = tasks.filter((t) => t.done).length;
  const pending = tasks.filter((t) => t.pending).length;
  const needsFix = tasks.filter((t) => t.needsFix).length;
  const inProgress = entries.filter((e) => getQuestStatus(e) === "in_progress").length;
  const remaining = total - approved;

  const earned = total > 0 && approved === total;
  let state: SealState;
  if (earned) {
    state = "earned";
  } else if (pending > 0) {
    state = "submitted";
  } else if (approved > 0 || inProgress > 0 || needsFix > 0) {
    state = "in_progress";
  } else {
    state = "locked";
  }

  const earnedAt = earned
    ? entries.reduce<number | undefined>((latest, entry) => {
        const at = entry.progress?.approvedAt;
        if (!at) return latest;
        return latest === undefined ? at : Math.max(latest, at);
      }, undefined)
    : undefined;

  const stampReward = entries.reduce((sum, entry) => sum + entry.quest.stampReward, 0);

  return {
    id: category,
    meta,
    state,
    entries,
    tasks,
    total,
    approved,
    pending,
    needsFix,
    remaining,
    percent: total > 0 ? Math.round((approved / total) * 100) : 0,
    stampReward,
    earnedAt,
  };
}

export function buildSeals(questsByCategory: Map<string, QuestEntry[]>): SealProgress[] {
  return SEAL_ORDER.map((category) =>
    deriveSeal(category, questsByCategory.get(category) ?? []),
  );
}

export type SeasonSummary = {
  totalSeals: number;
  earnedSeals: number;
  percent: number;
  nextSeal: SealProgress | null;
  daysRemaining: number | null;
  isComplete: boolean;
};

export function summariseSeason(
  seals: SealProgress[],
  campaign: { startsAt?: number; endsAt?: number } | null | undefined,
  now = Date.now(),
): SeasonSummary {
  const totalSeals = seals.length;
  const earnedSeals = seals.filter((seal) => seal.state === "earned").length;
  const nextSeal = seals.find((seal) => seal.state !== "earned") ?? null;
  const daysRemaining =
    campaign?.endsAt != null
      ? Math.max(0, Math.ceil((campaign.endsAt - now) / 86_400_000))
      : null;

  return {
    totalSeals,
    earnedSeals,
    percent: totalSeals > 0 ? Math.round((earnedSeals / totalSeals) * 100) : 0,
    nextSeal,
    daysRemaining,
    isComplete: totalSeals > 0 && earnedSeals === totalSeals,
  };
}

export function sealStateLabel(state: SealState): string {
  switch (state) {
    case "earned":
      return "Earned";
    case "submitted":
      return "Awaiting Review";
    case "in_progress":
      return "In Progress";
    default:
      return "Locked";
  }
}

export function formatSealDate(timestamp?: number): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
