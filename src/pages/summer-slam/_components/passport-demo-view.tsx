import { useEffect, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import PageShell from "@/components/page-shell.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { PassportDashboard } from "./passport-dashboard.tsx";
import { ssCard, ssCardPad, ssPageBg } from "./passport-dashboard-theme.ts";
import { PassportEvidenceDialog } from "./passport-evidence-dialog.tsx";
import { MOCK_CAMPAIGN, MOCK_PLAYER } from "./passport-mock-data.ts";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";
import {
  UPLOAD_FAILED_MESSAGE,
  type EvidenceType,
  type QuestEntry,
} from "./passport-types.ts";

type DemoProfile = {
  avatarId: PassportAvatarId | null;
  birthplaceId: PassportBirthplaceId | null;
};

function loadDemoProfile(
  storageKey: string,
  defaults?: DemoProfile,
): DemoProfile {
  if (typeof window === "undefined") {
    return defaults ?? { avatarId: null, birthplaceId: null };
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults ?? { avatarId: null, birthplaceId: null };
    return JSON.parse(raw) as DemoProfile;
  } catch {
    return defaults ?? { avatarId: null, birthplaceId: null };
  }
}

function saveDemoProfile(storageKey: string, profile: DemoProfile) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(profile));
  } catch {
    /* ignore storage failures */
  }
}

export function PassportDemoView({
  questEntries,
  profileStorageKey,
  variantLabel,
  alternateDemoHref,
  alternateDemoLabel,
  defaultProfile,
}: {
  questEntries: QuestEntry[];
  profileStorageKey: string;
  variantLabel: string;
  alternateDemoHref?: string;
  alternateDemoLabel?: string;
  defaultProfile?: DemoProfile;
}) {
  const [demoAvatarId, setDemoAvatarId] = useState<PassportAvatarId | null>(
    () => loadDemoProfile(profileStorageKey, defaultProfile).avatarId,
  );
  const [demoBirthplaceId, setDemoBirthplaceId] = useState<PassportBirthplaceId | null>(
    () => loadDemoProfile(profileStorageKey, defaultProfile).birthplaceId,
  );
  const [evidenceQuestId, setEvidenceQuestId] = useState<Id<"seasonalQuests"> | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("screenshot_link");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    saveDemoProfile(profileStorageKey, {
      avatarId: demoAvatarId,
      birthplaceId: demoBirthplaceId,
    });
  }, [demoAvatarId, demoBirthplaceId, profileStorageKey]);

  const evidenceQuest = questEntries.find((entry) => entry.quest._id === evidenceQuestId)?.quest;

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
      <PassportDashboard
        campaignTitle={MOCK_CAMPAIGN.title}
        playerName={MOCK_PLAYER.discordUsername}
        avatarId={demoAvatarId}
        birthplaceId={demoBirthplaceId}
        onSaveAvatar={async (avatarId) => {
          setDemoAvatarId(avatarId);
        }}
        onSaveBirthplace={async (birthplaceId) => {
          setDemoBirthplaceId(birthplaceId);
        }}
        quests={questEntries}
        campaign={MOCK_CAMPAIGN}
        onRequestEvidence={(entry) => setEvidenceQuestId(entry.quest._id)}
        notice={
          <div className={cn("flex flex-wrap items-center justify-between gap-2", ssCard, ssCardPad)}>
            <div>
              <Badge variant="outline" className="mb-1 border-orange-300 text-orange-700">
                Preview
              </Badge>
              <p className="text-xs text-orange-900/70">
                Demo for{" "}
                <span className="font-semibold text-orange-950">{MOCK_PLAYER.discordUsername}</span>{" "}
                — {variantLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {alternateDemoHref && alternateDemoLabel ? (
                <a
                  href={alternateDemoHref}
                  className="text-[11px] font-medium text-teal-700 hover:underline"
                >
                  {alternateDemoLabel}
                </a>
              ) : null}
              <a
                href="/summer-slam/passport"
                className="text-[11px] font-medium text-teal-700 hover:underline"
              >
                Live passport →
              </a>
            </div>
          </div>
        }
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
