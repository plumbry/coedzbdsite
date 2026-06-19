import type { Id } from "@/convex/_generated/dataModel.d.ts";

export const CAMPAIGN_SLUG = "summer-slam";

export const SLOTS_PER_CATEGORY = 3;

export const UNLINKED_TITLE = "Discord Account Not Linked";

export const UNLINKED_MESSAGE = `Your Discord account is not linked to a ZBD player profile yet.

Step 1:
Register for or play in a ZBD event using this Discord account.

Step 2:
Refresh this page.

Still not working?
Open a support ticket in Discord.`;

export const INACTIVE_CAMPAIGN_TITLE = "Season Closed";

export const INACTIVE_CAMPAIGN_MESSAGE = `Summer Slam is not currently active.

Passport progress may be read-only until the next season begins.`;

export const CAMPAIGN_NOT_READY_TITLE = "Coming Soon";

export const CAMPAIGN_NOT_READY_MESSAGE = `Summer Slam is still being prepared.

Staff are currently setting up quests and rewards.

Watch Discord for the official launch date.`;

export const PASSPORT_LOAD_TIMEOUT_MESSAGE = `Your passport is taking too long to load.

Refresh the page and check your connection.

If this continues, open a support ticket in Discord.`;

export const NO_QUESTS_TITLE = "Season Setup In Progress";

export const NO_QUESTS_MESSAGE = `Quests are not live yet.

This is not a problem with your account.

Watch Discord for the Summer Slam launch announcement.`;

export const UPLOAD_FAILED_MESSAGE = `Try a smaller image (under 5MB), JPG, PNG or WEBP format, or a clip link instead.

Video files cannot be uploaded directly.`;

export const SUBMISSION_ALREADY_SUBMITTED_MESSAGE = `This quest already has evidence waiting for staff review.

You cannot submit additional evidence until staff have responded.`;

export const SUBMISSION_FAILED_MESSAGE = `We couldn't submit your evidence.

Check your link or images and try again.

If the problem continues, contact support and include a screenshot.`;

export const EVIDENCE_SUBMITTED_SUCCESS_MESSAGE =
  "Evidence submitted successfully. Staff will review it — typical review time is 48–72 hours.";

/** @deprecated Use UPLOAD_FAILED_MESSAGE */
export const VIDEO_UPLOAD_ERROR = UPLOAD_FAILED_MESSAGE;

export function getPassportErrorTitle(message: string) {
  if (message === INACTIVE_CAMPAIGN_MESSAGE) return INACTIVE_CAMPAIGN_TITLE;
  return "Passport Unavailable";
}

export function mapEnsurePassportError(message: string) {
  if (message.includes("Campaign is not active")) return INACTIVE_CAMPAIGN_MESSAGE;
  if (message.includes("Campaign not found")) return CAMPAIGN_NOT_READY_MESSAGE;
  if (
    message.includes("PLAYER_NOT_LINKED") ||
    message.includes("linked to your Discord") ||
    message.includes("ZBD player profile")
  ) {
    return UNLINKED_MESSAGE;
  }
  return PASSPORT_LOAD_TIMEOUT_MESSAGE;
}

export const CLIP_LINK_HELPER =
  "Upload your clip to Discord, Medal, YouTube, Twitch, TikTok, Streamable or another hosting platform, then paste the link below.";

export const IMAGE_UPLOAD_HELPER =
  "Images only — up to 3 files, 5MB each. JPG, PNG or WEBP. For video, paste a clip link instead.";

export type EvidenceType =
  | "image"
  | "screenshot_link"
  | "clip_link"
  | "yunite_link"
  | "social_link"
  | "other";

export type QuestCategory =
  | "traveller"
  | "competitor"
  | "summer_spirit"
  | "team_player"
  | "community";

export type QuestStatus =
  | "not_started"
  | "in_progress"
  | "pending_review"
  | "approved"
  | "rejected"
  | "needs_more_evidence";

export const CATEGORY_PAGES: Array<{
  id: QuestCategory;
  emoji: string;
  label: string;
  accent: string;
  stampBorder: string;
  stampBg: string;
  stampText: string;
  headerBg: string;
  completeGlow: string;
}> = [
  {
    id: "traveller",
    emoji: "✈️",
    label: "Traveller",
    accent: "from-emerald-500/10 to-teal-600/5",
    stampBorder: "border-emerald-600/80",
    stampBg: "bg-emerald-500/20",
    stampText: "text-emerald-900",
    headerBg: "bg-emerald-600/10",
    completeGlow: "shadow-[0_0_24px_rgba(16,185,129,0.25)]",
  },
  {
    id: "competitor",
    emoji: "🏆",
    label: "Competitor",
    accent: "from-orange-500/10 to-amber-600/5",
    stampBorder: "border-orange-600/80",
    stampBg: "bg-orange-500/20",
    stampText: "text-orange-950",
    headerBg: "bg-orange-500/10",
    completeGlow: "shadow-[0_0_24px_rgba(249,115,22,0.25)]",
  },
  {
    id: "summer_spirit",
    emoji: "🌞",
    label: "Summer Spirit",
    accent: "from-pink-500/10 to-rose-500/5",
    stampBorder: "border-pink-600/80",
    stampBg: "bg-pink-500/20",
    stampText: "text-pink-950",
    headerBg: "bg-pink-500/10",
    completeGlow: "shadow-[0_0_24px_rgba(236,72,153,0.25)]",
  },
  {
    id: "team_player",
    emoji: "🤝",
    label: "Team Player",
    accent: "from-blue-500/10 to-sky-600/5",
    stampBorder: "border-blue-600/80",
    stampBg: "bg-blue-500/20",
    stampText: "text-blue-950",
    headerBg: "bg-blue-500/10",
    completeGlow: "shadow-[0_0_24px_rgba(59,130,246,0.25)]",
  },
  {
    id: "community",
    emoji: "💜",
    label: "Community",
    accent: "from-violet-500/10 to-purple-600/5",
    stampBorder: "border-violet-600/80",
    stampBg: "bg-violet-500/20",
    stampText: "text-violet-950",
    headerBg: "bg-violet-500/10",
    completeGlow: "shadow-[0_0_24px_rgba(139,92,246,0.25)]",
  },
];

export type QuestEntry = {
  quest: {
    _id: Id<"seasonalQuests">;
    title: string;
    description: string;
    category: string;
    completionMethod: "auto" | "manual" | "admin";
    evidenceInstructions?: string;
    adminHint?: string;
    stampReward: number;
  };
  progress: {
    status: string;
    progressCurrent?: number;
    progressTarget?: number;
    awardLog?: string;
    awardSource?: "auto" | "manual_review" | "admin";
    approvedAt?: number;
    updatedAt?: number;
  } | null;
};

export function getQuestStatus(entry: QuestEntry): QuestStatus {
  return (entry.progress?.status ?? "not_started") as QuestStatus;
}

export function getCategoryPage(category: string) {
  return CATEGORY_PAGES.find((page) => page.id === category) ?? CATEGORY_PAGES[0];
}

export function buildCategorySlots(entries: QuestEntry[], slotCount = SLOTS_PER_CATEGORY) {
  const slots: Array<QuestEntry | null> = [];
  for (let i = 0; i < slotCount; i += 1) {
    slots.push(entries[i] ?? null);
  }
  return slots;
}

export function countCategoryStats(entries: QuestEntry[]) {
  const approved = entries.filter((entry) => getQuestStatus(entry) === "approved").length;
  const pending = entries.filter((entry) => getQuestStatus(entry) === "pending_review").length;
  const needsAttention = entries.filter((entry) => {
    const status = getQuestStatus(entry);
    return status === "rejected" || status === "needs_more_evidence";
  }).length;
  const remaining = entries.filter((entry) => {
    const status = getQuestStatus(entry);
    return status === "not_started" || status === "in_progress";
  }).length;

  return {
    total: entries.length,
    approved,
    pending,
    needsAttention,
    remaining,
    isComplete: entries.length > 0 && approved === entries.length,
  };
}

export function computeProgressBreakdown(entries: QuestEntry[]) {
  const approved = entries.filter((entry) => getQuestStatus(entry) === "approved").length;
  const pending = entries.filter((entry) => getQuestStatus(entry) === "pending_review").length;
  const rejected = entries.filter((entry) => {
    const status = getQuestStatus(entry);
    return status === "rejected" || status === "needs_more_evidence";
  }).length;
  const remaining = entries.filter((entry) => {
    const status = getQuestStatus(entry);
    return status !== "approved" && status !== "pending_review" && status !== "rejected" && status !== "needs_more_evidence";
  }).length;

  return { approved, pending, rejected, remaining, total: entries.length };
}

export function computeNextBigEntry(approvedStamps: number, everyStamps: number) {
  if (everyStamps <= 0) return { current: 0, target: everyStamps, remaining: everyStamps };
  const current = approvedStamps % everyStamps;
  const remaining = current === 0 && approvedStamps > 0 ? everyStamps : everyStamps - current;
  return { current: current === 0 && approvedStamps > 0 ? everyStamps : current, target: everyStamps, remaining };
}

export function statusLabel(status: QuestStatus) {
  switch (status) {
    case "approved":
      return "Approved";
    case "pending_review":
      return "Waiting on Staff Review";
    case "rejected":
      return "Rejected";
    case "needs_more_evidence":
      return "More Evidence Needed";
    case "in_progress":
      return "In Progress";
    default:
      return "Not Started";
  }
}
