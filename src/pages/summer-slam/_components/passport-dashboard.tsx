import { useMemo, useState } from "react";
import { PassportHero } from "./passport-hero.tsx";
import { PassportProgressCard } from "./passport-progress-card.tsx";
import { PassportSealGrid } from "./passport-seal-grid.tsx";
import { PassportChallengeGrid } from "./passport-challenge-grid.tsx";
import { PassportEvidenceReviewPanel } from "./passport-evidence-review-panel.tsx";
import { PassportSealDetailDialog } from "./passport-seal-detail-dialog.tsx";
import { PassportQuestDetailDialog } from "./passport-quest-detail-dialog.tsx";
import {
  buildSeals,
  summariseSeason,
  type SealProgress,
} from "./passport-seal.ts";
import {
  CATEGORY_PAGES,
  getQuestStatus,
  type QuestEntry,
} from "./passport-types.ts";

function findActionableEntry(seal: SealProgress | null): QuestEntry | null {
  if (!seal) return null;
  const actionable = seal.tasks.filter((task) => {
    const status = getQuestStatus(task.entry);
    return (
      task.entry.quest.completionMethod === "manual" &&
      status !== "approved" &&
      status !== "pending_review"
    );
  });
  const needsFix = actionable.find((task) => task.needsFix);
  return (needsFix ?? actionable[0])?.entry ?? null;
}

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
  seasonLabel = "Season One · 2026",
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
  const actionableEntry = useMemo(() => findActionableEntry(nextSeal), [nextSeal]);

  const littleEvery = campaign?.littleWheelEntryEveryStamps ?? 1;
  const bigEvery = campaign?.bigWheelEntryEveryStamps ?? 5;
  const wheelTotals = useMemo(
    () => computeWheelTotals(quests, littleEvery, bigEvery),
    [quests, littleEvery, bigEvery],
  );

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
    <div className="space-y-8 pb-12">
      <PassportHero
        title={campaignTitle}
        seasonLabel={seasonLabel}
        playerName={playerName}
        daysRemaining={season.daysRemaining}
      />

      <PassportProgressCard
        season={season}
        approvedStamps={wheelTotals.approvedStamps}
        littleWheelEntries={wheelTotals.littleWheelEntries}
        bigWheelEntries={wheelTotals.bigWheelEntries}
        bigWheelEveryStamps={bigEvery}
      />

      <PassportSealGrid
        seals={seals}
        nextSealId={nextSeal?.id ?? null}
        onSelect={setSelectedSeal}
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
