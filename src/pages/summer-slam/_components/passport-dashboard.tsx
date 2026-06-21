import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { ClipboardList } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { PassportHero } from "./passport-hero.tsx";
import { PassportIdentitySection } from "./passport-identity-section.tsx";
import { PassportRewardsPanel } from "./passport-rewards-panel.tsx";
import { PassportEvidenceReviewPanel } from "./passport-evidence-review-panel.tsx";
import { PassportOnboarding } from "./passport-onboarding.tsx";
import { PassportCertificateDownloadButton } from "./passport-certificate-download-button.tsx";
import { ssCard, ssCardPad, ssStack } from "./passport-dashboard-theme.ts";
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
  notice,
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
  notice?: ReactNode;
}) {
  const [celebratingSealIds, setCelebratingSealIds] = useState<string[]>([]);
  const reduceMotion = useReducedMotion();
  const { isModeratorOrAdmin } = useUserRole();

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
        <PassportHero title={campaignTitle} className="mb-4 lg:mb-4" />

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

          <aside className={cn(ssStack, "min-w-0 gap-4")}>
            {notice}

            <PassportRewardsPanel
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
              quests={quests}
              onOpenTask={onRequestEvidence}
            />

            {isModeratorOrAdmin ? (
              <section className={cn(ssCard, ssCardPad)} aria-label="Review queue">
                <div className="mb-2 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-orange-600/70" aria-hidden />
                  <h2 className="text-base font-semibold text-orange-950">Review Queue</h2>
                  <span className="rounded-full bg-orange-100 px-2 py-px text-[10px] font-semibold uppercase text-orange-700">
                    Staff
                  </span>
                </div>
                <p className="mb-3 text-xs text-orange-900/55">
                  Review player evidence and approve stamps from the admin panel.
                </p>
                <Link
                  to="/admin/summer-slam"
                  className="inline-flex min-h-10 items-center rounded-lg border border-orange-200 bg-orange-50/50 px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 touch-manipulation"
                >
                  Open review queue →
                </Link>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
