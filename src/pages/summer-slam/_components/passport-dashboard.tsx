import { useMemo, useState } from "react";
import { PassportHero } from "./passport-hero.tsx";
import { PassportWelcome } from "./passport-welcome.tsx";
import { PassportJourney } from "./passport-journey.tsx";
import { PassportNextDestination } from "./passport-next-destination.tsx";
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
  campaign: { startsAt?: number; endsAt?: number } | null | undefined;
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

  // Keep the open seal dialog in sync with the latest derived data.
  const liveSelectedSeal = selectedSeal
    ? (seals.find((seal) => seal.id === selectedSeal.id) ?? selectedSeal)
    : null;

  const statusLabel = season.isComplete
    ? "All five seals collected"
    : `${season.earnedSeals} / ${season.totalSeals} seals collected`;

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
    <div className="space-y-5 pb-12 pt-2">
      <PassportHero
        title={campaignTitle}
        seasonLabel={seasonLabel}
        statusLabel={statusLabel}
      />

      <PassportWelcome playerName={playerName} season={season} />

      <PassportJourney
        seals={seals}
        nextSealId={nextSeal?.id ?? null}
        onSelect={setSelectedSeal}
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <PassportNextDestination
          seal={nextSeal}
          actionableEntry={actionableEntry}
          onOpenTask={setDetailEntry}
          onSubmitEvidence={handleSubmitFromAnywhere}
          onViewSeal={setSelectedSeal}
        />
        <PassportEvidenceReviewPanel quests={quests} onOpenTask={setDetailEntry} />
      </div>

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
