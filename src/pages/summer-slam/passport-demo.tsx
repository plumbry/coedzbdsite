import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import PageShell from "@/components/page-shell.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
import { PassportDashboard } from "./_components/passport-dashboard.tsx";
import { ssPageBg } from "./_components/passport-dashboard-theme.ts";
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
    <PageShell maxWidth="wide" className={ssPageBg}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white/90 px-4 py-3 shadow-sm">
        <div>
          <Badge variant="outline" className="mb-1.5 border-stone-300 text-stone-600">
            Preview environment
          </Badge>
          <p className="text-sm text-stone-700">
            Demo passport for{" "}
            <span className="font-semibold text-stone-900">{MOCK_PLAYER.discordUsername}</span>{" "}
            — mock data, no login required.
          </p>
        </div>
        <a
          href="/summer-slam/passport"
          className="text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline"
        >
          Live passport →
        </a>
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
