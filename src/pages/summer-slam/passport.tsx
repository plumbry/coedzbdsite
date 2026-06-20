import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import AuthGate from "@/components/auth-gate.tsx";
import PageShell from "@/components/page-shell.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { PassportDashboard } from "./_components/passport-dashboard.tsx";
import { ssCard, ssPageBg, ssSkeleton } from "./_components/passport-dashboard-theme.ts";
import { PassportEvidenceDialog } from "./_components/passport-evidence-dialog.tsx";
import {
  CAMPAIGN_SLUG,
  CAMPAIGN_NOT_READY_MESSAGE,
  CAMPAIGN_NOT_READY_TITLE,
  EVIDENCE_SUBMITTED_SUCCESS_MESSAGE,
  getPassportErrorTitle,
  mapEnsurePassportError,
  PASSPORT_LOAD_TIMEOUT_MESSAGE,
  SUBMISSION_ALREADY_SUBMITTED_MESSAGE,
  SUBMISSION_FAILED_MESSAGE,
  UNLINKED_MESSAGE,
  UNLINKED_TITLE,
  UPLOAD_FAILED_MESSAGE,
  type EvidenceType,
  type QuestEntry,
} from "./_components/passport-types.ts";

function PassportLoader() {
  return (
    <PageShell maxWidth="wide" className={ssPageBg}>
      <div className="space-y-4 pt-1 pb-8">
        <Skeleton className={cn("mx-auto h-40 w-64 max-w-full", ssSkeleton)} />
        <Skeleton className={cn("mx-auto h-28 w-48 max-w-full", ssSkeleton)} />
        <Skeleton className={cn("h-16 w-full", ssSkeleton)} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className={cn("h-36 w-full", ssSkeleton)} />
          ))}
        </div>
      </div>
    </PageShell>
  );
}

function PassportUnavailable({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <PageShell maxWidth="narrow" className={ssPageBg}>
      <Card className={cn("mt-10", ssCard, "shadow-none")}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="space-y-3 text-base leading-relaxed whitespace-pre-wrap">
            <span>{description}</span>
            {actionHref && actionLabel ? (
              <span className="block">
                <a href={actionHref} className="font-medium text-primary underline">
                  {actionLabel}
                </a>
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
      </Card>
    </PageShell>
  );
}

function LoginPrompt() {
  return (
    <PageShell maxWidth="narrow" className={ssPageBg}>
      <div className="flex min-h-[50vh] items-center">
        <AuthGate
          title="Sign in with Discord"
          description="Log in with the Discord account you use for ZBD events to open your Summer Slam Passport."
        >
          <SignInButton signInText="Continue with Discord" />
        </AuthGate>
      </div>
    </PageShell>
  );
}

function PassportContent() {
  const [evidenceQuestId, setEvidenceQuestId] = useState<Id<"seasonalQuests"> | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("screenshot_link");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [passportError, setPassportError] = useState<string | null>(null);
  const [isEnsuringPassport, setIsEnsuringPassport] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();

  const ensureMyPassport = useMutation(api.seasonal.ensureMyPassport);
  const setPassportAvatar = useMutation(api.seasonal.setPassportAvatar);
  const setPassportBirthplace = useMutation(api.seasonal.setPassportBirthplace);
  const generateEvidenceUploadUrl = useMutation(api.seasonal.generateEvidenceUploadUrl);
  const submitEvidence = useMutation(api.seasonal.submitEvidence);
  const passport = useQuery(
    api.seasonal.getPassport,
    isConvexAuthenticated ? { slug: CAMPAIGN_SLUG } : "skip",
  );

  useEffect(() => {
    if (!isConvexAuthenticated) {
      setIsEnsuringPassport(true);
      return;
    }

    let cancelled = false;
    setIsEnsuringPassport(true);
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setPassportError(PASSPORT_LOAD_TIMEOUT_MESSAGE);
        setIsEnsuringPassport(false);
      }
    }, 10000);

    void ensureMyPassport({ slug: CAMPAIGN_SLUG })
      .then(() => {
        if (!cancelled) setPassportError(null);
      })
      .catch((error) => {
        console.error(error);
        const message = String(error?.data?.message || error?.message || "");
        if (!cancelled) {
          setPassportError(mapEnsurePassportError(message));
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) setIsEnsuringPassport(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [ensureMyPassport, isConvexAuthenticated]);

  const quests = (passport?.quests ?? []) as QuestEntry[];
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
      const images = [];
      for (const file of submissionType === "image" ? selectedFiles : []) {
        const uploadUrl = await generateEvidenceUploadUrl({ slug: CAMPAIGN_SLUG });
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) {
          throw new Error("UPLOAD_FAILED");
        }
        const { storageId } = await response.json();
        images.push({ storageId, fileName: file.name });
      }

      await submitEvidence({
        slug: CAMPAIGN_SLUG,
        questId: evidenceQuest._id,
        evidenceTypes: [submissionType, ...(trimmedNotes ? ["notes" as const] : [])],
        evidenceUrls: trimmedUrl ? [trimmedUrl] : undefined,
        notes: trimmedNotes || undefined,
        images,
      });
      toast.success(EVIDENCE_SUBMITTED_SUCCESS_MESSAGE);
      resetSubmission();
    } catch (error) {
      console.error(error);
      const message = String(
        (error as { data?: { message?: string } })?.data?.message ||
          (error as Error)?.message ||
          "",
      );
      if (
        message.includes("pending submission") ||
        message.includes("pending review") ||
        message.includes("already has a pending")
      ) {
        toast.error("Already Submitted", { description: SUBMISSION_ALREADY_SUBMITTED_MESSAGE });
      } else if (message === "UPLOAD_FAILED" || message.includes("Video")) {
        toast.error("Upload Failed", { description: UPLOAD_FAILED_MESSAGE });
      } else if (message) {
        toast.error("Submission Failed", { description: message });
      } else {
        toast.error("Submission Failed", { description: SUBMISSION_FAILED_MESSAGE });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (passportError) {
    return (
      <PassportUnavailable
        title={getPassportErrorTitle(passportError)}
        description={passportError}
        actionHref="/support"
        actionLabel="Open a support ticket"
      />
    );
  }

  if (isEnsuringPassport || passport === undefined) {
    return <PassportLoader />;
  }

  if (!passport.campaign) {
    return (
      <PassportUnavailable
        title={CAMPAIGN_NOT_READY_TITLE}
        description={CAMPAIGN_NOT_READY_MESSAGE}
        actionHref="/support"
        actionLabel="Open a support ticket"
      />
    );
  }

  if (!passport.player) {
    return (
      <PassportUnavailable
        title={UNLINKED_TITLE}
        description={UNLINKED_MESSAGE}
        actionHref="/support"
        actionLabel="Open a support ticket"
      />
    );
  }

  return (
    <PageShell maxWidth="wide" className={ssPageBg}>
      <PassportDashboard
        campaignTitle={passport.campaign.title}
        playerName={passport.player.discordUsername}
        avatarId={passport.passport?.avatarId}
        birthplaceId={passport.passport?.birthplaceId}
        onSaveAvatar={async (avatarId) => {
          await setPassportAvatar({ slug: CAMPAIGN_SLUG, avatarId });
        }}
        onSaveBirthplace={async (birthplaceId) => {
          await setPassportBirthplace({ slug: CAMPAIGN_SLUG, birthplaceId });
        }}
        quests={quests}
        campaign={passport.campaign}
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
  );
}

export default function SummerSlamPassportPage() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <PassportLoader />;
  }

  if (!isSignedIn) {
    return <LoginPrompt />;
  }

  return <PassportContent />;
}
