import { useEffect, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import PageShell from "@/components/page-shell.tsx";
import { CompactMobileButtonsOptOut } from "@/components/compact-mobile-buttons.tsx";
import { toast } from "sonner";
import { PassportDashboard } from "./passport-dashboard.tsx";
import { PassportEvidenceDialog } from "./passport-evidence-dialog.tsx";
import { ssPageBg } from "./passport-dashboard-theme.ts";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";
import { UPLOAD_FAILED_MESSAGE, type EvidenceType, type QuestEntry } from "./passport-types.ts";

export type PassportEvidenceSubmitPayload = {
  questId: Id<"seasonalQuests">;
  evidenceType: EvidenceType;
  evidenceUrl: string;
  notes: string;
  selectedFiles: File[];
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
  onSubmitEvidence,
}: {
  campaignTitle: string;
  playerName: string;
  avatarId?: PassportAvatarId | null;
  birthplaceId?: PassportBirthplaceId | null;
  onSaveAvatar?: (avatarId: PassportAvatarId) => Promise<void>;
  onSaveBirthplace?: (birthplaceId: PassportBirthplaceId) => Promise<void>;
  quests: QuestEntry[];
  campaign: {
    startsAt?: number;
    endsAt?: number;
    littleWheelEntryEveryStamps?: number;
    bigWheelEntryEveryStamps?: number;
  } | null | undefined;
  onSubmitEvidence: (payload: PassportEvidenceSubmitPayload) => Promise<void>;
}) {
  const [evidenceQuestId, setEvidenceQuestId] = useState<Id<"seasonalQuests"> | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("screenshot_link");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const evidenceQuest = quests.find((entry) => entry.quest._id === evidenceQuestId)?.quest;

  useEffect(() => {
    if (!evidenceQuest) return;
    if (evidenceQuest.evidenceInput === "image") {
      setEvidenceType("image");
      setEvidenceUrl("");
      setSelectedFiles([]);
      return;
    }
    if (evidenceQuest.evidenceInput === "link") {
      setEvidenceType("screenshot_link");
      setEvidenceUrl("");
      setSelectedFiles([]);
    }
  }, [evidenceQuest?._id, evidenceQuest?.evidenceInput]);

  const handleFiles = (files: FileList | null) => {
    const incoming = [...(files ?? [])];
    const video = incoming.find(
      (file) =>
        file.type.startsWith("video/") || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(file.name),
    );
    if (video) {
      toast.error("Upload Failed", { description: UPLOAD_FAILED_MESSAGE });
      return;
    }
    if (incoming.length > 3) {
      toast.error("Maximum 3 images per submission. Remove one and try again.");
      return;
    }
    const next = incoming.slice(0, 3);
    const invalid = next.find(
      (file) => !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type),
    );
    const oversized = next.find((file) => file.size > 5 * 1024 * 1024);
    if (invalid || oversized) {
      toast.error("Upload Failed", { description: UPLOAD_FAILED_MESSAGE });
      return;
    }
    setSelectedFiles(next);
  };

  const resetSubmission = () => {
    setEvidenceQuestId(null);
    setSelectedFiles([]);
    setEvidenceType("screenshot_link");
    setEvidenceUrl("");
    setNotes("");
  };

  const handleSubmitEvidence = async () => {
    if (!evidenceQuest) return;
    const trimmedUrl = evidenceUrl.trim();
    const trimmedNotes = notes.trim();
    const submissionType =
      evidenceQuest.evidenceInput === "image"
        ? "image"
        : evidenceQuest.evidenceInput === "link"
          ? "screenshot_link"
          : evidenceType;
    if (submissionType === "image" && selectedFiles.length === 0) {
      toast.error("Choose at least one image before submitting.");
      return;
    }
    if (submissionType !== "image" && submissionType !== "other" && !trimmedUrl) {
      toast.error("Paste your evidence link before submitting.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitEvidence({
        questId: evidenceQuest._id,
        evidenceType: submissionType,
        evidenceUrl: trimmedUrl,
        notes: trimmedNotes,
        selectedFiles: submissionType === "image" ? selectedFiles : [],
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
        onRequestEvidence={(entry) => setEvidenceQuestId(entry.quest._id)}
      />

      <PassportEvidenceDialog
        open={!!evidenceQuestId}
        quest={evidenceQuest}
        evidenceType={evidenceType}
        evidenceUrl={evidenceUrl}
        notes={notes}
        selectedFiles={selectedFiles}
        isSubmitting={isSubmitting}
        onEvidenceTypeChange={(type) => {
          setEvidenceType(type);
          if (type !== "image") setSelectedFiles([]);
        }}
        onEvidenceUrlChange={setEvidenceUrl}
        onNotesChange={setNotes}
        onFilesChange={handleFiles}
        onClose={resetSubmission}
        onSubmit={handleSubmitEvidence}
      />
    </PageShell>
    </CompactMobileButtonsOptOut>
  );
}
