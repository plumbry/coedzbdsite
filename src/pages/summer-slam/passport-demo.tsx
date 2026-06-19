import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import PageShell from "@/components/page-shell.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
import { PassportDashboard } from "./_components/passport-dashboard.tsx";
import { PassportEvidenceDialog } from "./_components/passport-evidence-dialog.tsx";
import {
  MOCK_CAMPAIGN,
  MOCK_PLAYER,
  MOCK_QUEST_ENTRIES,
} from "./_components/passport-mock-data.ts";
import {
  UPLOAD_FAILED_MESSAGE,
  type EvidenceType,
} from "./_components/passport-types.ts";

export default function SummerSlamPassportDemoPage() {
  const [evidenceQuestId, setEvidenceQuestId] = useState<Id<"seasonalQuests"> | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("screenshot_link");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notes, setNotes] = useState("");

  const evidenceQuest = MOCK_QUEST_ENTRIES.find(
    (entry) => entry.quest._id === evidenceQuestId,
  )?.quest;

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
    setSelectedFiles(incoming.slice(0, 3));
  };

  const resetSubmission = () => {
    setEvidenceQuestId(null);
    setSelectedFiles([]);
    setEvidenceType("screenshot_link");
    setEvidenceUrl("");
    setNotes("");
  };

  return (
    <PageShell maxWidth="wide" className="bg-[#F7F8FA]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <Badge variant="secondary" className="mb-1">
            Admin preview
          </Badge>
          <p className="text-sm font-medium text-slate-800">
            Mock passport for <span className="font-bold">{MOCK_PLAYER.discordUsername}</span> —
            sample data only, no login required.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Live player passports:{" "}
          <a href="/summer-slam/passport" className="font-medium text-primary underline">
            /summer-slam/passport
          </a>
        </p>
      </div>

      <PassportDashboard
        campaignTitle={MOCK_CAMPAIGN.title}
        playerName={MOCK_PLAYER.discordUsername}
        quests={MOCK_QUEST_ENTRIES}
        campaign={MOCK_CAMPAIGN}
        onRequestEvidence={(entry) => setEvidenceQuestId(entry.quest._id)}
      />

      <PassportEvidenceDialog
        open={!!evidenceQuestId}
        quest={evidenceQuest}
        evidenceType={evidenceType}
        evidenceUrl={evidenceUrl}
        notes={notes}
        selectedFiles={selectedFiles}
        isSubmitting={false}
        onEvidenceTypeChange={(type) => {
          setEvidenceType(type);
          if (type !== "image") setSelectedFiles([]);
        }}
        onEvidenceUrlChange={setEvidenceUrl}
        onNotesChange={setNotes}
        onFilesChange={handleFiles}
        onClose={resetSubmission}
        onSubmit={() => {
          toast.info("Demo mode — evidence is not submitted.");
          resetSubmission();
        }}
      />
    </PageShell>
  );
}
