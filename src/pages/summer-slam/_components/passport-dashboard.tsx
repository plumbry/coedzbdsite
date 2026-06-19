import { useMemo, useState } from "react";
import { getDestination } from "./passport-destinations.ts";
import { PassportHero } from "./passport-hero.tsx";
import { PassportJourneyRoute } from "./passport-journey-route.tsx";
import { PassportSpread } from "./passport-spread.tsx";
import { PassportRewardsPanel } from "./passport-rewards-panel.tsx";
import { PassportNextDestination } from "./passport-next-destination.tsx";
import { PassportChallengeGrid } from "./passport-challenge-grid.tsx";
import { PassportEvidenceReviewPanel } from "./passport-evidence-review-panel.tsx";
import { PassportSealDetailDialog } from "./passport-seal-detail-dialog.tsx";
import { PassportQuestDetailDialog } from "./passport-quest-detail-dialog.tsx";
import { PassportOnboarding } from "./passport-onboarding.tsx";
import { ssGridGap, ssStack } from "./passport-dashboard-theme.ts";
import {
  buildSeals,
  getActionableEntry,
  summariseSeason,
  type SealProgress,
} from "./passport-seal.ts";
import { CATEGORY_PAGES, getQuestStatus, type QuestEntry } from "./passport-types.ts";
import { cn } from "@/lib/utils.ts";

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
  quests,
  campaign,
  onRequestEvidence,
}: {
  campaignTitle: string;
  playerName: string;
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
  const [selectedSeal, setSelectedSeal] = useState<SealProgress | null>(null);
  const [detailEntry, setDetailEntry] = useState<QuestEntry | null>(null);

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
  const nextSeal = season.nextSeal;
  const actionableEntry = useMemo(() => getActionableEntry(nextSeal), [nextSeal]);

  const littleEvery = campaign?.littleWheelEntryEveryStamps ?? 1;
  const bigEvery = campaign?.bigWheelEntryEveryStamps ?? 5;
  const wheelTotals = useMemo(
    () => computeWheelTotals(quests, littleEvery, bigEvery),
    [quests, littleEvery, bigEvery],
  );

  const currentDestination = nextSeal
    ? getDestination(nextSeal.id).name
    : season.isComplete
      ? "Summer Finale"
      : null;

  const liveSelectedSeal = selectedSeal
    ? (seals.find((seal) => seal.id === selectedSeal.id) ?? selectedSeal)
    : null;

  const handleOpenTask = (entry: QuestEntry) => {
    setSelectedSeal(null);
    setDetailEntry(entry);
  };

  const handleSubmitFromAnywhere = (entry: QuestEntry) => {
    setSelectedSeal(null);
    setDetailEntry(null);
    onRequestEvidence(entry);
  };

  return (
    <div className={cn(ssStack, "pb-8")}>
      <PassportOnboarding />

      <PassportHero
        title={campaignTitle}
        playerName={playerName}
        daysRemaining={season.daysRemaining}
        earnedSeals={season.earnedSeals}
        totalSeals={season.totalSeals}
        percent={season.percent}
        currentDestination={currentDestination}
      />

      <div className={cn("grid xl:grid-cols-[1fr_200px]", ssGridGap)}>
        <PassportSpread
          seals={seals}
          nextSealId={nextSeal?.id ?? null}
          onSelect={setSelectedSeal}
        />
        <div className={cn("hidden flex-col xl:flex", ssStack)}>
          <PassportJourneyRoute seals={seals} nextSealId={nextSeal?.id ?? null} />
          <PassportRewardsPanel
            season={season}
            littleWheelEntries={wheelTotals.littleWheelEntries}
            bigWheelEntries={wheelTotals.bigWheelEntries}
            approvedStamps={wheelTotals.approvedStamps}
          />
        </div>
      </div>

      <div className={cn("grid sm:grid-cols-2 xl:hidden", ssGridGap)}>
        <PassportJourneyRoute seals={seals} nextSealId={nextSeal?.id ?? null} />
        <PassportRewardsPanel
          season={season}
          littleWheelEntries={wheelTotals.littleWheelEntries}
          bigWheelEntries={wheelTotals.bigWheelEntries}
          approvedStamps={wheelTotals.approvedStamps}
        />
      </div>

      <PassportNextDestination
        seal={nextSeal}
        actionableEntry={actionableEntry}
        onOpenTask={handleOpenTask}
        onSubmitEvidence={handleSubmitFromAnywhere}
        onViewSeal={setSelectedSeal}
      />

      <PassportChallengeGrid
        seals={seals}
        nextSealId={nextSeal?.id ?? null}
        actionableEntry={actionableEntry}
        onOpenTask={handleOpenTask}
        onSubmitEvidence={handleSubmitFromAnywhere}
        onViewSeal={setSelectedSeal}
      />

      <PassportEvidenceReviewPanel quests={quests} onOpenTask={handleOpenTask} />

      <PassportSealDetailDialog
        open={!!liveSelectedSeal}
        seal={liveSelectedSeal}
        onClose={() => setSelectedSeal(null)}
        onOpenTask={handleOpenTask}
        onSubmitEvidence={handleSubmitFromAnywhere}
      />

      <PassportQuestDetailDialog
        open={!!detailEntry}
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        onSubmitEvidence={() => {
          if (detailEntry) handleSubmitFromAnywhere(detailEntry);
        }}
      />
    </div>
  );
}
