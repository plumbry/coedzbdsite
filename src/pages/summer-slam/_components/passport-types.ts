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

export const CAMPAIGN_NOT_STARTED_TITLE = "Coming Soon";

export const CAMPAIGN_NOT_STARTED_MESSAGE = `The season hasn't started yet.

Watch Discord for the official start date, then return here to open your passport.`;

export const CAMPAIGN_ENDED_TITLE = "Season Closed";

export const CAMPAIGN_ENDED_MESSAGE = `Summer Slam has ended.

You can still view your passport progress, but new evidence submissions are closed.`;

export const CAMPAIGN_NOT_READY_TITLE = "Coming Soon";

export const CAMPAIGN_NOT_READY_MESSAGE = `Summer Slam is still being prepared.

Staff are currently setting up quests and rewards.

Watch Discord for the official launch date.`;

export const PASSPORT_LOAD_TIMEOUT_MESSAGE = `Your passport is taking too long to load.

Refresh the page and check your connection.

If this continues, open a support ticket in Discord.`;

export const PASSPORT_LOAD_FAILED_MESSAGE = `We couldn’t open your passport.

Refresh the page and try again.

If this continues, open a support ticket in Discord.`;

export const NO_QUESTS_TITLE = "Season Setup In Progress";

export const NO_QUESTS_MESSAGE = `Quests are not live yet.

This is not a problem with your account.

Watch Discord for the Summer Slam launch announcement.`;

export const UPLOAD_FAILED_MESSAGE = `Host your screenshot on a public image site (we recommend postimages.org), then paste the direct link.

Video clips should also be submitted as a link (Medal, Streamable, Twitch, etc.).`;

export const SUBMISSION_ALREADY_SUBMITTED_MESSAGE = `This quest already has evidence waiting for staff review.

You cannot submit additional evidence until staff have responded.`;

export const SUBMISSION_FAILED_MESSAGE = `We couldn't submit your evidence.

Check your link and try again.

If the problem continues, contact support and include a screenshot.`;

export const EVIDENCE_SUBMITTED_SUCCESS_MESSAGE =
  "Evidence submitted successfully. Staff will review it — typical review time is 48–72 hours.";

/** @deprecated Use UPLOAD_FAILED_MESSAGE */
export const VIDEO_UPLOAD_ERROR = UPLOAD_FAILED_MESSAGE;

export const SUBMISSIONS_CLOSED_MESSAGE = `The submission deadline has passed.

Staff may still be reviewing evidence submitted before the season ended.`;

export const SUBMISSIONS_NOT_OPEN_MESSAGE = `Evidence submissions are not open yet.

You can still explore your passport — watch Discord for when Submit goes live.`;

export function getPassportErrorTitle(message: string) {
  if (message === CAMPAIGN_NOT_STARTED_MESSAGE) return CAMPAIGN_NOT_STARTED_TITLE;
  if (message === CAMPAIGN_ENDED_MESSAGE || message === INACTIVE_CAMPAIGN_MESSAGE) {
    return INACTIVE_CAMPAIGN_TITLE;
  }
  if (message === UNLINKED_MESSAGE) return UNLINKED_TITLE;
  if (message === PASSPORT_LOAD_TIMEOUT_MESSAGE) return "Passport Unavailable";
  return "Passport Unavailable";
}

export function mapEnsurePassportError(message: string) {
  if (message.includes("Campaign has not started")) return CAMPAIGN_NOT_STARTED_MESSAGE;
  if (message.includes("Evidence submissions are not open")) return SUBMISSIONS_NOT_OPEN_MESSAGE;
  if (message.includes("Campaign has ended") || message.includes("Submissions are closed")) {
    return SUBMISSIONS_CLOSED_MESSAGE;
  }
  if (message.includes("Campaign is not active")) return INACTIVE_CAMPAIGN_MESSAGE;
  if (message.includes("Campaign not found")) return CAMPAIGN_NOT_READY_MESSAGE;
  if (
    message.includes("PLAYER_NOT_LINKED") ||
    message.includes("linked to your Discord") ||
    message.includes("ZBD player profile")
  ) {
    return UNLINKED_MESSAGE;
  }
  if (
    message.includes("DISCORD_NOT_LINKED") ||
    message.includes("Sign in with Discord to claim")
  ) {
    return `Sign in with the Discord account you use for ZBD events.

Use “Sign in with Discord”, then try Claim Passport again.`;
  }
  if (
    message.includes("taking too long") ||
    message.includes("timed out") ||
    message.includes("Timeout")
  ) {
    return PASSPORT_LOAD_TIMEOUT_MESSAGE;
  }
  return PASSPORT_LOAD_FAILED_MESSAGE;
}

/** Pull a usable message out of Convex action/mutation client errors. */
export function extractConvexErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error ?? "");
  }
  const record = error as { data?: unknown; message?: unknown };
  const data = record.data;
  if (typeof data === "string" && data.trim()) {
    return data;
  }
  if (data && typeof data === "object") {
    const payload = data as { message?: unknown; code?: unknown };
    const parts = [
      typeof payload.message === "string" ? payload.message : "",
      typeof payload.code === "string" ? payload.code : "",
    ].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" ");
    }
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  return "";
}

export const CLIP_LINK_HELPER =
  "Upload your clip to Discord, Medal, Streamable, Twitch, TikTok or another hosting platform, then paste the link below.";

export const SCREENSHOT_LINK_HELPER =
  "Upload your screenshot to Postimages or another public image host, then paste the direct link below.";

/** @deprecated Use SCREENSHOT_LINK_HELPER — direct image uploads are no longer supported. */
export const IMAGE_UPLOAD_HELPER = SCREENSHOT_LINK_HELPER;

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
    evidenceInput?: "image" | "link";
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
