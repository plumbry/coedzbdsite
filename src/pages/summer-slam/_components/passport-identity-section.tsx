import { useState } from "react";
import { toast } from "sonner";
import { PassportAvatarPickerDialog } from "./passport-avatar-picker-dialog.tsx";
import { PassportIdentityCard } from "./passport-identity-card.tsx";
import type { PassportAvatarId } from "./passport-avatars.ts";
import type { PassportBirthplaceId } from "./passport-birthplaces.ts";
import type { SealProgress } from "./passport-seal.ts";

export function PassportIdentitySection({
  playerName,
  avatarId,
  birthplaceId,
  seals,
  completionPercent,
  currentDestination,
  daysRemaining,
  seasonStartsAt,
  seasonEndsAt,
  onSaveAvatar,
  onSaveBirthplace,
}: {
  playerName: string;
  avatarId: PassportAvatarId | null | undefined;
  birthplaceId: PassportBirthplaceId | null | undefined;
  seals: SealProgress[];
  completionPercent: number;
  currentDestination: string | null;
  daysRemaining: number | null;
  seasonStartsAt?: number;
  seasonEndsAt?: number;
  onSaveAvatar: (avatarId: PassportAvatarId) => Promise<void>;
  onSaveBirthplace: (birthplaceId: PassportBirthplaceId) => Promise<void>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingBirthplace, setIsSavingBirthplace] = useState(false);

  const handleSave = async (nextAvatarId: PassportAvatarId) => {
    setIsSaving(true);
    try {
      await onSaveAvatar(nextAvatarId);
      setPickerOpen(false);
    } catch {
      toast.error("Could not save avatar. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBirthplace = async (nextBirthplaceId: PassportBirthplaceId) => {
    setIsSavingBirthplace(true);
    try {
      await onSaveBirthplace(nextBirthplaceId);
    } catch {
      toast.error("Could not save birthplace. Please try again.");
    } finally {
      setIsSavingBirthplace(false);
    }
  };

  return (
    <>
      <PassportIdentityCard
        playerName={playerName}
        avatarId={avatarId}
        birthplaceId={birthplaceId}
        seals={seals}
        completionPercent={completionPercent}
        currentDestination={currentDestination}
        daysRemaining={daysRemaining}
        seasonStartsAt={seasonStartsAt}
        seasonEndsAt={seasonEndsAt}
        onChangeAvatar={() => setPickerOpen(true)}
        onBirthplaceChange={handleSaveBirthplace}
        isSavingBirthplace={isSavingBirthplace}
      />

      <PassportAvatarPickerDialog
        open={pickerOpen}
        savedAvatarId={avatarId}
        isSaving={isSaving}
        onClose={() => setPickerOpen(false)}
        onSave={handleSave}
      />
    </>
  );
}
