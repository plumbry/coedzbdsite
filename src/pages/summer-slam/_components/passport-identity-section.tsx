import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { PassportAvatarPickerDialog } from "./passport-avatar-picker-dialog.tsx";
import { PassportIdentityCard } from "./passport-identity-card.tsx";
import {
  PassportPageSpread,
  buildBonusSealProgress,
  type PassportPageId,
} from "./passport-page-spread.tsx";
import {
  buildBonusQuestEntries,
  isBonusStampUnlocked,
} from "./passport-bonus-stamp.ts";
import { computeQuestPoints, getPassportTier } from "./passport-levels.ts";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";
import type { SealProgress } from "./passport-seal.ts";
import type { QuestEntry } from "./passport-types.ts";

export function PassportIdentitySection({
  playerName,
  avatarId,
  birthplaceId,
  seals,
  quests,
  completionPercent,
  seasonStartsAt,
  seasonEndsAt,
  celebratingSealIds,
  onSelectSeal: onSelectSealExternal,
  onSaveAvatar,
  onSaveBirthplace,
  onOpenTask,
  onSubmitEvidence,
  className,
}: {
  playerName: string;
  avatarId: PassportAvatarId | null | undefined;
  birthplaceId: PassportBirthplaceId | null | undefined;
  seals: SealProgress[];
  quests: QuestEntry[];
  completionPercent: number;
  seasonStartsAt?: number;
  seasonEndsAt?: number;
  celebratingSealIds: string[];
  onSelectSeal?: (seal: SealProgress) => void;
  onSaveAvatar?: (avatarId: PassportAvatarId) => Promise<void>;
  onSaveBirthplace?: (birthplaceId: PassportBirthplaceId) => Promise<void>;
  onOpenTask?: (entry: QuestEntry) => void;
  onSubmitEvidence?: (entry: QuestEntry) => void;
  className?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingBirthplace, setIsSavingBirthplace] = useState(false);
  const [openPageId, setOpenPageId] = useState<PassportPageId | null>(null);
  const [selectedQuest, setSelectedQuest] = useState<QuestEntry | null>(null);

  const canEditProfile = Boolean(onSaveAvatar && onSaveBirthplace);
  const bonusUnlocked = isBonusStampUnlocked(seals);
  const questPoints = useMemo(() => computeQuestPoints(quests), [quests]);
  const passportTier = useMemo(() => getPassportTier(questPoints), [questPoints]);
  const pagesCompleted = seals.filter((seal) => seal.state === "earned").length;
  const totalPages = seals.length;

  const bonusQuestEntries = useMemo(
    () => buildBonusQuestEntries(seals, false),
    [seals],
  );
  const bonusSeal = useMemo(() => buildBonusSealProgress(bonusQuestEntries), [bonusQuestEntries]);

  const openSeal = useMemo(() => {
    if (!openPageId) return null;
    if (openPageId === "summer_legend") return bonusSeal;
    return seals.find((seal) => seal.id === openPageId) ?? null;
  }, [openPageId, seals, bonusSeal]);

  const handleSelectSeal = (seal: SealProgress) => {
    setOpenPageId(seal.id);
    setSelectedQuest(null);
    onSelectSealExternal?.(seal);
  };

  const handleSelectBonus = () => {
    setOpenPageId("summer_legend");
    setSelectedQuest(null);
  };

  const handleBackToCover = () => {
    setOpenPageId(null);
    setSelectedQuest(null);
  };

  const handleOpenTask = (entry: QuestEntry) => {
    setSelectedQuest(entry);
    onOpenTask?.(entry);
  };

  const handleSubmitFromPage = (entry: QuestEntry) => {
    setSelectedQuest(null);
    onSubmitEvidence?.(entry);
  };

  const handleSave = async (nextAvatarId: PassportAvatarId) => {
    if (!onSaveAvatar || nextAvatarId === avatarId) return;
    setIsSaving(true);
    try {
      await onSaveAvatar(nextAvatarId);
      toast.success("Passport photo saved");
    } catch {
      toast.error("Could not save avatar. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBirthplace = async (nextBirthplaceId: PassportBirthplaceId) => {
    if (!onSaveBirthplace || nextBirthplaceId === birthplaceId) return;
    setIsSavingBirthplace(true);
    try {
      await onSaveBirthplace(nextBirthplaceId);
      toast.success("Birthplace saved to your passport");
    } catch {
      toast.error("Could not save birthplace. Please try again.");
    } finally {
      setIsSavingBirthplace(false);
    }
  };

  const pageCelebrating =
    openSeal != null && celebratingSealIds.includes(openSeal.id);

  return (
    <>
      <div className={cn("flex flex-col", className)}>
      <PassportIdentityCard
        playerName={playerName}
        avatarId={avatarId}
        birthplaceId={birthplaceId}
        seals={seals}
        completionPercent={completionPercent}
        questPoints={questPoints}
        passportTier={passportTier}
        pagesCompleted={pagesCompleted}
        totalPages={totalPages}
        bonusUnlocked={bonusUnlocked}
        seasonStartsAt={seasonStartsAt}
        seasonEndsAt={seasonEndsAt}
        celebratingSealIds={celebratingSealIds}
        onSelectSeal={handleSelectSeal}
        onSelectBonus={handleSelectBonus}
        onChangeAvatar={canEditProfile ? () => setPickerOpen(true) : undefined}
        onBirthplaceChange={canEditProfile ? handleSaveBirthplace : undefined}
        isSavingBirthplace={isSavingBirthplace}
        readOnly={!canEditProfile}
      >
        {openSeal ? (
          <PassportPageSpread
            className="h-full lg:h-full"
            seal={openSeal}
            selectedQuest={selectedQuest}
            celebrating={pageCelebrating}
            onBackToCover={handleBackToCover}
            onOpenTask={handleOpenTask}
            onCloseQuest={() => setSelectedQuest(null)}
            onSubmitEvidence={handleSubmitFromPage}
          />
        ) : null}
      </PassportIdentityCard>
      </div>

      {canEditProfile ? (
        <PassportAvatarPickerDialog
          open={pickerOpen}
          savedAvatarId={avatarId}
          isSaving={isSaving}
          onClose={() => setPickerOpen(false)}
          onSave={handleSave}
        />
      ) : null}
    </>
  );
}
