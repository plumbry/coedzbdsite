export type RejectionReasonTemplate = {
  id: string;
  label: string;
  playerMessage: string;
};

export const REJECTION_REASON_TEMPLATES: RejectionReasonTemplate[] = [
  {
    id: "incorrect_evidence",
    label: "Incorrect evidence",
    playerMessage: "The evidence submitted does not match what this quest requires. Review the quest instructions and submit proof that clearly shows the requirement was met.",
  },
  {
    id: "missing_information",
    label: "Missing information",
    playerMessage: "Your submission is missing required information. Check the quest instructions and resubmit with all details staff need to verify completion.",
  },
  {
    id: "invalid_link",
    label: "Invalid link",
    playerMessage: "The link provided could not be opened or does not show valid evidence. Upload your clip to a public hosting platform and paste a working link, or submit a screenshot instead.",
  },
  {
    id: "wrong_game_mode",
    label: "Wrong game mode",
    playerMessage: "This evidence was from the wrong game mode or format. Complete the quest in the required mode and submit new evidence.",
  },
  {
    id: "duplicate_submission",
    label: "Duplicate submission",
    playerMessage: "This evidence has already been used for another quest or was resubmitted without changes. Submit new evidence that meets the quest requirements.",
  },
  {
    id: "does_not_meet_requirements",
    label: "Does not meet quest requirements",
    playerMessage: "This submission does not meet the quest requirements. Read the quest description and evidence instructions carefully, then resubmit if you qualify.",
  },
];

export function buildReviewMessage(templateId: string | undefined, extraNote: string): string | undefined {
  const template = REJECTION_REASON_TEMPLATES.find((entry) => entry.id === templateId);
  const trimmedExtra = extraNote.trim();
  if (!template && !trimmedExtra) return undefined;
  if (!template) return trimmedExtra;
  if (!trimmedExtra) return template.playerMessage;
  return `${template.playerMessage}\n\n${trimmedExtra}`;
}
