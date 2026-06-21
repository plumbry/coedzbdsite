import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import AuthGate from "@/components/auth-gate.tsx";
import PageShell from "@/components/page-shell.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { PassportExperience, type PassportEvidenceSubmitPayload } from "./_components/passport-experience.tsx";
import type { PassportAvatarId } from "./_components/passport-avatars.ts";
import type { PassportBirthplaceId } from "./_components/passport-birthplaces.ts";
import { ssCard, ssPageBg, ssPageContainer, ssPageContent, ssSkeleton } from "./_components/passport-dashboard-theme.ts";
import { PASSPORT_HEADER_IMG_CLASS } from "./_components/passport-assets.ts";
import {
  CAMPAIGN_SLUG,
  CAMPAIGN_NOT_READY_MESSAGE,
  CAMPAIGN_NOT_READY_TITLE,
  CAMPAIGN_NOT_STARTED_MESSAGE,
  CAMPAIGN_NOT_STARTED_TITLE,
  CAMPAIGN_ENDED_MESSAGE,
  CAMPAIGN_ENDED_TITLE,
  INACTIVE_CAMPAIGN_MESSAGE,
  INACTIVE_CAMPAIGN_TITLE,
  EVIDENCE_SUBMITTED_SUCCESS_MESSAGE,
  getPassportErrorTitle,
  mapEnsurePassportError,
  PASSPORT_LOAD_TIMEOUT_MESSAGE,
  SUBMISSION_ALREADY_SUBMITTED_MESSAGE,
  SUBMISSION_FAILED_MESSAGE,
  UNLINKED_MESSAGE,
  UNLINKED_TITLE,
  UPLOAD_FAILED_MESSAGE,
  type QuestEntry,
} from "./_components/passport-types.ts";
import { getCampaignPhase, phaseMessage } from "./_components/campaign-phase.ts";

function PassportLoader() {
  return (
    <PageShell maxWidth="wide" className={ssPageBg}>
      <div className={ssPageContent}>
        <div className={ssPageContainer}>
          <Skeleton className={cn(PASSPORT_HEADER_IMG_CLASS, "aspect-[944/375]", ssSkeleton)} />
          <Skeleton className={cn("h-16 w-full", ssSkeleton)} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className={cn("h-36 w-full", ssSkeleton)} />
            ))}
          </div>
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
  const [passportError, setPassportError] = useState<string | null>(null);
  const [isEnsuringPassport, setIsEnsuringPassport] = useState(true);
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();

  const ensureMyPassport = useMutation(api.seasonal.ensureMyPassport);
  const setPassportAvatar = useMutation(api.seasonal.setPassportAvatar);
  const setPassportBirthplace = useMutation(api.seasonal.setPassportBirthplace);
  const generateEvidenceUploadUrl = useMutation(api.seasonal.generateEvidenceUploadUrl);
  const submitEvidence = useMutation(api.seasonal.submitEvidence);
  const campaign = useQuery(
    api.seasonal.getCampaign,
    isConvexAuthenticated ? { slug: CAMPAIGN_SLUG } : "skip",
  );
  const passport = useQuery(
    api.seasonal.getPassport,
    isConvexAuthenticated ? { slug: CAMPAIGN_SLUG } : "skip",
  );

  const serverAvatarId = passport?.passport?.avatarId ?? null;
  const serverBirthplaceId = passport?.passport?.birthplaceId ?? null;
  const [avatarId, setAvatarId] = useState<PassportAvatarId | null>(null);
  const [birthplaceId, setBirthplaceId] = useState<PassportBirthplaceId | null>(null);

  useEffect(() => {
    setAvatarId(serverAvatarId);
  }, [serverAvatarId]);

  useEffect(() => {
    setBirthplaceId(serverBirthplaceId);
  }, [serverBirthplaceId]);

  const campaignPhase = getCampaignPhase(campaign ?? null);

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

  const handleSubmitEvidence = async (payload: PassportEvidenceSubmitPayload) => {
    const { questId, evidenceType: submissionType, evidenceUrl: trimmedUrl, notes: trimmedNotes, selectedFiles } =
      payload;
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
        questId,
        evidenceTypes: [submissionType, ...(trimmedNotes ? ["notes" as const] : [])],
        evidenceUrls: trimmedUrl ? [trimmedUrl] : undefined,
        notes: trimmedNotes || undefined,
        images,
      });
      toast.success(EVIDENCE_SUBMITTED_SUCCESS_MESSAGE);
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
      throw error;
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

  if (campaign !== undefined && campaignPhase !== "active") {
    const phaseUnavailable =
      campaignPhase === "not_started"
        ? { title: CAMPAIGN_NOT_STARTED_TITLE, description: CAMPAIGN_NOT_STARTED_MESSAGE }
        : campaignPhase === "ended"
          ? { title: CAMPAIGN_ENDED_TITLE, description: CAMPAIGN_ENDED_MESSAGE }
          : campaignPhase === "not_configured"
            ? { title: CAMPAIGN_NOT_READY_TITLE, description: CAMPAIGN_NOT_READY_MESSAGE }
            : { title: INACTIVE_CAMPAIGN_TITLE, description: phaseMessage(campaignPhase) ?? INACTIVE_CAMPAIGN_MESSAGE };

    return (
      <PassportUnavailable
        title={phaseUnavailable.title}
        description={phaseUnavailable.description}
        actionHref="/summer-slam"
        actionLabel="Back to Summer Slam"
      />
    );
  }

  if (isEnsuringPassport || campaign === undefined || passport === undefined) {
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
    <PassportExperience
      campaignTitle={passport.campaign.title}
      playerName={passport.player.discordUsername}
      avatarId={avatarId}
      birthplaceId={birthplaceId}
      onSaveAvatar={async (nextAvatarId) => {
        const previous = avatarId;
        setAvatarId(nextAvatarId);
        try {
          await setPassportAvatar({ slug: CAMPAIGN_SLUG, avatarId: nextAvatarId });
        } catch (error) {
          setAvatarId(previous);
          throw error;
        }
      }}
      onSaveBirthplace={async (nextBirthplaceId) => {
        const previous = birthplaceId;
        setBirthplaceId(nextBirthplaceId);
        try {
          await setPassportBirthplace({ slug: CAMPAIGN_SLUG, birthplaceId: nextBirthplaceId });
        } catch (error) {
          setBirthplaceId(previous);
          throw error;
        }
      }}
      quests={quests}
      campaign={passport.campaign}
      onSubmitEvidence={handleSubmitEvidence}
    />
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
