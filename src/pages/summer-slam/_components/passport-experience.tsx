import { useEffect, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import PageShell from "@/components/page-shell.tsx";
import { CompactMobileButtonsOptOut } from "@/components/compact-mobile-buttons.tsx";
import { toast } from "sonner";
import { PassportDashboard } from "./passport-dashboard.tsx";
import { MAX_EVIDENCE_LINKS, PassportEvidenceDialog } from "./passport-evidence-dialog.tsx";
import { ssPageBg } from "./passport-dashboard-theme.ts";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";
import { type EvidenceType, type QuestEntry } from "./passport-types.ts";
import type { CampaignPublic } from "./campaign-phase.ts";

export type PassportEvidenceSubmitPayload = {
  questId: Id<"seasonalQuests">;
  evidenceType: EvidenceType;
  evidenceUrls: string[];
  notes: string;
};

export function PassportExperience({
  campaignTitle,
  playerName,
  avatarId,
  birthplaceId,
  onSaveAvatar,
  onSaveBirthplace,
  quests,
  campaign,
  isAdminPreview = false,
  onSubmitEvidence,
}: {
  campaignTitle: string;
  playerName: string;
  avatarId?: PassportAvatarId | null;
  birthplaceId?: PassportBirthplaceId | null;
  onSaveAvatar?: (avatarId: PassportAvatarId) => Promise<void>;
  onSaveBirthplace?: (birthplaceId: PassportBirthplaceId) => Promise<void>;
  quests: QuestEntry[];
  campaign: CampaignPublic | null | undefined;
  isAdminPreview?: boolean;
  onSubmitEvidence: (payload: PassportEvidenceSubmitPayload) => Promise<void>;
}) {
  const [evidenceQuestId, setEvidenceQuestId] = useState<Id<"seasonalQuests"> | null>(null);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("screenshot_link");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([""]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const evidenceQuest = quests.find((entry) => entry.quest._id === evidenceQuestId)?.quest;

  useEffect(() => {
    if (!evidenceQuest) return;
    // "image" quests now require a public screenshot link (e.g. Postimages), not a file upload.
    if (evidenceQuest.evidenceInput === "image" || evidenceQuest.evidenceInput === "link") {
      setEvidenceType("screenshot_link");
      setEvidenceUrls([""]);
    }
  }, [evidenceQuest?._id, evidenceQuest?.evidenceInput]);

  const resetSubmission = () => {
    setEvidenceQuestId(null);
    setEvidenceType("screenshot_link");
    setEvidenceUrls([""]);
    setNotes("");
  };

  const handleSubmitEvidence = async () => {
    if (!evidenceQuest) return;
    const trimmedUrls = evidenceUrls.map((url) => url.trim()).filter(Boolean);
    const trimmedNotes = notes.trim();
    const submissionType =
      evidenceQuest.evidenceInput === "image" || evidenceQuest.evidenceInput === "link"
        ? "screenshot_link"
        : evidenceType;
    if (submissionType !== "other" && trimmedUrls.length === 0) {
      toast.error("Paste your evidence link before submitting.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitEvidence({
        questId: evidenceQuest._id,
        evidenceType: submissionType,
        evidenceUrls: trimmedUrls,
        notes: trimmedNotes,
      });
      resetSubmission();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CompactMobileButtonsOptOut>
      <PageShell maxWidth="wide" className={ssPageBg}>
        <PassportDashboard
          campaignTitle={campaignTitle}
          playerName={playerName}
          avatarId={avatarId}
          birthplaceId={birthplaceId}
          onSaveAvatar={onSaveAvatar}
          onSaveBirthplace={onSaveBirthplace}
          quests={quests}
          campaign={campaign}
          isAdminPreview={isAdminPreview}
          onRequestEvidence={(entry) => setEvidenceQuestId(entry.quest._id)}
        />

        <PassportEvidenceDialog
          open={!!evidenceQuestId}
          quest={evidenceQuest}
          evidenceType={evidenceType}
          evidenceUrls={evidenceUrls}
          notes={notes}
          isSubmitting={isSubmitting}
          onEvidenceTypeChange={setEvidenceType}
          onEvidenceUrlChange={(index, url) => {
            setEvidenceUrls((prev) => prev.map((value, i) => (i === index ? url : value)));
          }}
          onAddEvidenceUrl={() => {
            setEvidenceUrls((prev) =>
              prev.length >= MAX_EVIDENCE_LINKS ? prev : [...prev, ""],
            );
          }}
          onRemoveEvidenceUrl={(index) => {
            setEvidenceUrls((prev) => {
              if (prev.length <= 1) return prev;
              return prev.filter((_, i) => i !== index);
            });
          }}
          onNotesChange={setNotes}
          onClose={resetSubmission}
          onSubmit={handleSubmitEvidence}
        />
      </PageShell>
    </CompactMobileButtonsOptOut>
  );
}
