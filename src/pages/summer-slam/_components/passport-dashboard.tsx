import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { PassportHero } from "./passport-hero.tsx";
import { PassportIdentitySection } from "./passport-identity-section.tsx";
import { PassportRewardsPanel } from "./passport-rewards-panel.tsx";
import { PassportEvidenceReviewPanel } from "./passport-evidence-review-panel.tsx";
import { PassportOnboarding } from "./passport-onboarding.tsx";
import { PassportCertificateDownloadButton } from "./passport-certificate-download-button.tsx";
import { ssPassportGrid, ssPassportMainColumn, ssPassportSidebar, ssPageContainer, ssPageContent } from "./passport-dashboard-theme.ts";
import {
  buildSeals,
  summariseSeason,
} from "./passport-seal.ts";
import { areProfileEditsOpen, areSubmissionsOpen, getCampaignPhase } from "./campaign-phase.ts";
import type { CampaignPublic } from "./campaign-phase.ts";
import { CATEGORY_PAGES, getQuestStatus, type QuestEntry } from "./passport-types.ts";
import { isBonusQuestCategory, isBonusStampUnlocked } from "./passport-bonus-stamp.ts";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";

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
  isAdminPreview = false,
  onRequestEvidence,
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
  seasonLabel?: string;
  onRequestEvidence: (entry: QuestEntry) => void;
}) {
  const [celebratingSealIds, setCelebratingSealIds] = useState<string[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const reduceMotion = useReducedMotion();

  const { mainQuests, bonusQuestEntries } = useMemo(() => {
    const main: QuestEntry[] = [];
    const bonus: QuestEntry[] = [];
    for (const entry of quests) {
      if (isBonusQuestCategory(entry.quest.category)) {
        bonus.push(entry);
      } else {
        main.push(entry);
      }
    }
    return { mainQuests: main, bonusQuestEntries: bonus };
  }, [quests]);

  const questsByCategory = useMemo(() => {
    const groups = new Map<string, QuestEntry[]>();
    for (const page of CATEGORY_PAGES) groups.set(page.id, []);
    for (const entry of mainQuests) {
      const key = entry.quest.category;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return groups;
  }, [mainQuests]);

  const seals = useMemo(
    () => buildSeals(questsByCategory, campaign?.categoryTaglines),
    [questsByCategory, campaign?.categoryTaglines],
  );
  const season = useMemo(() => summariseSeason(seals, campaign), [seals, campaign]);
  const bonusUnlocked = useMemo(() => isBonusStampUnlocked(seals), [seals]);
  const visibleQuests = useMemo(
    () => (bonusUnlocked ? quests : mainQuests),
    [bonusUnlocked, mainQuests, quests],
  );

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
  const submissionsOpen = areSubmissionsOpen(campaign, Date.now(), { adminPreview: isAdminPreview });
  const profileEditable = areProfileEditsOpen(campaign, Date.now(), { adminPreview: isAdminPreview });
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
    <div className={ssPageContent}>
      <PassportOnboarding
        forceOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

      <div className={ssPageContainer}>
        <div className="mb-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-9 -ml-2 px-2 text-xs text-teal-800 touch-manipulation hover:bg-teal-50 hover:text-teal-950 lg:h-8 lg:text-[11px]"
          >
            <Link to="/summer-slam">
              <ArrowLeft className="mr-1.5 h-4 w-4 lg:mr-1 lg:h-3.5 lg:w-3.5" aria-hidden />
              Back
            </Link>
          </Button>
        </div>

        <PassportHero title={campaignTitle} />

        {isAdminPreview ? (
          <p className="rounded-lg border border-violet-200/80 bg-violet-50/70 px-3 py-2 text-sm text-violet-950/90">
            Admin preview — the season has not started yet. Use this passport to verify quests and
            layout before players can claim passports.
          </p>
        ) : !submissionsOpen && getCampaignPhase(campaign, Date.now()) === "active" ? (
          <p className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-sm text-amber-950/90">
            Passports are open, but evidence submissions are not switched on yet. You can explore
            quests now — watch Discord for when Submit opens.
          </p>
        ) : !submissionsOpen ? (
          <p className="rounded-lg border border-orange-200/70 bg-orange-50/60 px-3 py-2 text-sm text-orange-900/80">
            Submissions are closed for this season. Your passport is read-only while staff finish
            reviewing evidence.
          </p>
        ) : null}

        <div className={ssPassportGrid}>
          <div className={ssPassportMainColumn}>
            <PassportIdentitySection
            playerName={playerName}
            avatarId={avatarId}
            birthplaceId={birthplaceId}
            seals={seals}
            quests={mainQuests}
            bonusQuestEntries={bonusQuestEntries}
            bonusTagline={campaign?.categoryTaglines?.summer_legend}
            completionPercent={season.questPercent}
            seasonStartsAt={campaign?.startsAt}
            seasonEndsAt={campaign?.endsAt}
            celebratingSealIds={celebratingSealIds}
            onSaveAvatar={onSaveAvatar}
            onSaveBirthplace={onSaveBirthplace}
            onSubmitEvidence={onRequestEvidence}
            submissionsOpen={submissionsOpen}
            profileEditable={profileEditable}
            isAdminPreview={isAdminPreview}
            />
          </div>

          <aside className={ssPassportSidebar}>
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
              onHowItWorks={() => setShowOnboarding(true)}
            />

            <PassportEvidenceReviewPanel
              quests={visibleQuests}
              onUpdateEvidence={onRequestEvidence}
              submissionsOpen={submissionsOpen}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
