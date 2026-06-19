import type { QuestEntry } from "./passport-types.ts";

export type QuestCompletionMethod = QuestEntry["quest"]["completionMethod"];

export type QuestTypeInfo = {
  emoji: string;
  label: string;
  shortLabel: string;
  requiresSubmission: boolean;
  summary: string;
  detail: string;
};

export function getQuestTypeInfo(method: QuestCompletionMethod): QuestTypeInfo {
  switch (method) {
    case "auto":
      return {
        emoji: "🤖",
        label: "Auto Tracked",
        shortLabel: "Auto",
        requiresSubmission: false,
        summary: "No submission required.",
        detail: "Progress updates automatically when you complete the quest in-game.",
      };
    case "admin":
      return {
        emoji: "🏅",
        label: "Staff Awarded",
        shortLabel: "Staff",
        requiresSubmission: false,
        summary: "No submission required.",
        detail: "Staff will award this stamp when you meet the requirements.",
      };
    default:
      return {
        emoji: "📎",
        label: "Requires Submission",
        shortLabel: "Submit",
        requiresSubmission: true,
        summary: "Evidence must be submitted for staff review.",
        detail: "Submit proof below. Staff will review it before you earn your stamp.",
      };
  }
}

export function categoryQuestsLabel(categoryLabel: string) {
  return `${categoryLabel} Quests`;
}

export function textToBullets(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  if (lines.length > 1) return lines;

  const single = lines[0] ?? text.trim();
  if (!single) return [];
  if (single.length > 120 && single.includes(". ")) {
    return single
      .split(/\.\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (part.endsWith(".") ? part : `${part}.`));
  }
  return [single];
}

export function getEvidenceSubmitOptions(instructions?: string): string[] {
  const defaults = ["Screenshot or image", "Clip link", "Match or Yunite link"];
  if (!instructions?.trim()) return defaults;

  const lower = instructions.toLowerCase();
  const options: string[] = [];
  if (lower.includes("screenshot") || lower.includes("image") || lower.includes("photo")) {
    options.push("Screenshot or image");
  }
  if (lower.includes("clip") || lower.includes("video")) {
    options.push("Clip link");
  }
  if (lower.includes("yunite") || lower.includes("match")) {
    options.push("Match or Yunite link");
  }
  if (lower.includes("discord") || lower.includes("social")) {
    options.push("Discord or social link");
  }
  return options.length > 0 ? options : defaults;
}

export function getNextStepCopy(
  status: string,
  requiresSubmission: boolean,
): string | null {
  if (status === "pending_review") {
    return null;
  }
  if (status === "needs_more_evidence" && requiresSubmission) {
    return "Tap Resubmit Evidence below and provide the information requested by staff.";
  }
  if (status === "rejected" && requiresSubmission) {
    return "Read the staff note carefully. If you still qualify for this stamp, submit new evidence that addresses the issue.";
  }
  if (status === "not_started" && requiresSubmission) {
    return "Complete the quest, then tap Submit Evidence.";
  }
  if (status === "in_progress" && requiresSubmission) {
    return "Keep playing — submit evidence when you meet the requirement.";
  }
  if (status === "not_started" || status === "in_progress") {
    return "Play as normal — your progress updates automatically.";
  }
  return null;
}
