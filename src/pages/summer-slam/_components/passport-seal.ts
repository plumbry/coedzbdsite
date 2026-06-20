import {
  getQuestStatus,
  type QuestCategory,
  type QuestEntry,
  type QuestStatus,
} from "./passport-types.ts";
import { STAMP_IMAGES } from "./passport-assets.ts";

/**
 * Seal model for the Summer Slam Passport dashboard.
 *
 * Each of the five quest categories maps to one collectible "seal". A seal is
 * earned when every quest in its category is approved. The official seal PNG
 * assets live in /public/summer-slam/seals.
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
    title: "Traveller Stamp",
    tagline: "Explore every mode and chart your summer journey.",
    image: STAMP_IMAGES.traveller,
    accent: "#3b8fd4",
    tint: "#e8f3fc",
    glow: "shadow-[0_10px_40px_-8px_rgba(59,143,212,0.55)]",
    text: "text-sky-600",
  },
  competitor: {
    id: "competitor",
    label: "Competitor",
    title: "Competitor Stamp",
    tagline: "Climb the leaderboard and claim victory royales.",
    image: STAMP_IMAGES.competitor,
    accent: "#d4a524",
    tint: "#fef6e0",
    glow: "shadow-[0_10px_40px_-8px_rgba(212,165,36,0.55)]",
    text: "text-amber-600",
  },
  summer_spirit: {
    id: "summer_spirit",
    label: "Summer Spirit",
    title: "Summer Spirit Stamp",
    tagline: "Soak up the season and share the good vibes.",
    image: STAMP_IMAGES.summer_spirit,
    accent: "#e55a52",
    tint: "#fde8e6",
    glow: "shadow-[0_10px_40px_-8px_rgba(229,90,82,0.55)]",
    text: "text-red-500",
  },
  team_player: {
    id: "team_player",
    label: "Team Player",
    title: "Team Player Stamp",
    tagline: "Squad up and win it together.",
    image: STAMP_IMAGES.team_player,
    accent: "#2db8a8",
    tint: "#e0f7f4",
    glow: "shadow-[0_10px_40px_-8px_rgba(45,184,168,0.55)]",
    text: "text-teal-600",
  },
  community: {
    id: "community",
    label: "Community",
    title: "Community Stamp",
    tagline: "Lift up the crew and connect the community.",
    image: STAMP_IMAGES.community,
    accent: "#d94878",
    tint: "#fce8f0",
    glow: "shadow-[0_10px_40px_-8px_rgba(217,72,120,0.55)]",
    text: "text-pink-600",
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
  totalQuests: number;
  approvedQuests: number;
  questPercent: number;
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
  const totalQuests = seals.reduce((sum, seal) => sum + seal.total, 0);
  const approvedQuests = seals.reduce((sum, seal) => sum + seal.approved, 0);
  const nextSeal = seals.find((seal) => seal.state !== "earned") ?? null;
  const daysRemaining =
    campaign?.endsAt != null
      ? Math.max(0, Math.ceil((campaign.endsAt - now) / 86_400_000))
      : null;

  return {
    totalSeals,
    earnedSeals,
    percent: totalSeals > 0 ? Math.round((earnedSeals / totalSeals) * 100) : 0,
    totalQuests,
    approvedQuests,
    questPercent: totalQuests > 0 ? Math.round((approvedQuests / totalQuests) * 100) : 0,
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

/**
 * Player-facing status used for the consistent status badge + tooltips. Unlike
 * the raw {@link SealState}, this surfaces a "needs_changes" state so players
 * know when staff have requested clearer evidence.
 */
export type SealBadgeStatus =
  | "earned"
  | "pending"
  | "needs_changes"
  | "in_progress"
  | "locked";

export function sealBadgeStatus(seal: SealProgress): SealBadgeStatus {
  if (seal.state === "earned") return "earned";
  if (seal.state === "submitted") return "pending";
  if (seal.needsFix > 0) return "needs_changes";
  if (seal.state === "in_progress") return "in_progress";
  return "locked";
}

/**
 * The next quest a player can act on within a seal: a manual quest that is not
 * already approved or awaiting review. Quests needing changes are prioritised.
 */
export function getActionableEntry(seal: SealProgress | null): QuestEntry | null {
  if (!seal) return null;
  const actionable = seal.tasks.filter((task) => {
    const status = getQuestStatus(task.entry);
    return (
      task.entry.quest.completionMethod === "manual" &&
      status !== "approved" &&
      status !== "pending_review"
    );
  });
  const needsFix = actionable.find((task) => task.needsFix);
  return (needsFix ?? actionable[0])?.entry ?? null;
}

export function formatSealDate(timestamp?: number): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
