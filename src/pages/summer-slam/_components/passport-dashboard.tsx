import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { PassportHero } from "./passport-hero.tsx";
import { PassportIdentitySection } from "./passport-identity-section.tsx";
import { PassportRewardsPanel } from "./passport-rewards-panel.tsx";
import { PassportEvidenceReviewPanel } from "./passport-evidence-review-panel.tsx";
import { PassportOnboarding } from "./passport-onboarding.tsx";
import { PassportCertificateDownloadButton } from "./passport-certificate-download-button.tsx";
import { ssStack } from "./passport-dashboard-theme.ts";
import {
  buildSeals,
  summariseSeason,
} from "./passport-seal.ts";
import { CATEGORY_PAGES, getQuestStatus, type QuestEntry } from "./passport-types.ts";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";
import { cn } from "@/lib/utils.ts";

const EARNED_SEALS_STORAGE_KEY = "summer-slam-earned-seals";

function computeWheelTotals(
  quests: QuestEntry[],
  littleEvery: number,
  bigEvery: number,
) {
  const approvedStamps = quests
    .filter((entry) => getQuestStatus(entry) === "approved")
    .reduce((sum, entry) => sum + entry.quest.stampReward, 0);

  return {
    approvedStamps,
    littleWheelEntries: littleEvery > 0 ? Math.floor(approvedStamps / littleEvery) : 0,
    bigWheelEntries: bigEvery > 0 ? Math.floor(approvedStamps / bigEvery) : 0,
  };
}

export function PassportDashboard({
  campaignTitle,
  playerName,
  avatarId,
  birthplaceId,
  onSaveAvatar,
  onSaveBirthplace,
  quests,
  campaign,
  onRequestEvidence,
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
  seasonLabel?: string;
  onRequestEvidence: (entry: QuestEntry) => void;
}) {
  const [celebratingSealIds, setCelebratingSealIds] = useState<string[]>([]);
  const reduceMotion = useReducedMotion();

  const questsByCategory = useMemo(() => {
    const groups = new Map<string, QuestEntry[]>();
    for (const page of CATEGORY_PAGES) groups.set(page.id, []);
    for (const entry of quests) {
      const key = entry.quest.category;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return groups;
  }, [quests]);

  const seals = useMemo(() => buildSeals(questsByCategory), [questsByCategory]);
  const season = useMemo(() => summariseSeason(seals, campaign), [seals, campaign]);

  useEffect(() => {
    if (reduceMotion) return;
    const earnedIds = seals.filter((seal) => seal.state === "earned").map((seal) => seal.id);
    const prev = JSON.parse(localStorage.getItem(EARNED_SEALS_STORAGE_KEY) ?? "[]") as string[];
    const newlyEarned = earnedIds.filter((id) => !prev.includes(id));
    if (newlyEarned.length === 0) return;

    setCelebratingSealIds(newlyEarned);
    localStorage.setItem(EARNED_SEALS_STORAGE_KEY, JSON.stringify(earnedIds));
    const timer = window.setTimeout(() => setCelebratingSealIds([]), 1500);
    return () => window.clearTimeout(timer);
  }, [seals, reduceMotion]);

  const littleEvery = campaign?.littleWheelEntryEveryStamps ?? 1;
  const bigEvery = campaign?.bigWheelEntryEveryStamps ?? 5;
  const wheelTotals = useMemo(
    () => computeWheelTotals(quests, littleEvery, bigEvery),
    [quests, littleEvery, bigEvery],
  );

  const certificateDownload =
    season.isComplete && onSaveAvatar && onSaveBirthplace ? (
      <PassportCertificateDownloadButton
        playerName={playerName}
        avatarId={avatarId}
        birthplaceId={birthplaceId}
        seals={seals}
        seasonStartsAt={campaign?.startsAt}
        seasonEndsAt={campaign?.endsAt}
      />
    ) : null;

  return (
    <div className={cn(ssStack, "pb-8")}>
      <PassportOnboarding />

      <div className="mx-auto w-full max-w-6xl px-3 sm:px-4">
        <PassportHero title={campaignTitle} className="mb-4 w-full" />

        <div className="flex flex-col gap-6 lg:grid lg:items-stretch lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)] lg:gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
            <PassportIdentitySection
            playerName={playerName}
            avatarId={avatarId}
            birthplaceId={birthplaceId}
            seals={seals}
            quests={quests}
            completionPercent={season.questPercent}
            seasonStartsAt={campaign?.startsAt}
            seasonEndsAt={campaign?.endsAt}
            celebratingSealIds={celebratingSealIds}
            onSaveAvatar={onSaveAvatar}
            onSaveBirthplace={onSaveBirthplace}
            onSubmitEvidence={onRequestEvidence}
            />
          </div>

          <aside className={cn(ssStack, "min-w-0 gap-4 lg:flex lg:min-h-0 lg:flex-col")}>
            <PassportRewardsPanel
              className="shrink-0"
              season={season}
              littleWheelEntries={wheelTotals.littleWheelEntries}
              bigWheelEntries={wheelTotals.bigWheelEntries}
              approvedStamps={wheelTotals.approvedStamps}
              playerName={playerName}
              avatarId={avatarId}
              birthplaceId={birthplaceId}
              seals={seals}
              seasonStartsAt={campaign?.startsAt}
              seasonEndsAt={campaign?.endsAt}
              certificateDownload={certificateDownload}
            />

            <PassportEvidenceReviewPanel
              className="lg:min-h-0 lg:flex-1"
              quests={quests}
              onUpdateEvidence={onRequestEvidence}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
