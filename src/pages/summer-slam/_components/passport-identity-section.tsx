import { useState } from "react";
import { toast } from "sonner";
import { PassportAvatarPickerDialog } from "./passport-avatar-picker-dialog.tsx";
import { PassportIdentityCard } from "./passport-identity-card.tsx";
import type { PassportAvatarId } from "./passport-avatars.ts";

export function PassportIdentitySection({
  playerName,
  avatarId,
  earnedSeals,
  totalSeals,
  completionPercent,
  currentDestination,
  daysRemaining,
  seasonStartsAt,
  onSaveAvatar,
}: {
  playerName: string;
  avatarId: PassportAvatarId | null | undefined;
  earnedSeals: number;
  totalSeals: number;
  completionPercent: number;
  currentDestination: string | null;
  daysRemaining: number | null;
  seasonStartsAt?: number;
  onSaveAvatar: (avatarId: PassportAvatarId) => Promise<void>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  return (
    <>
      <PassportIdentityCard
        playerName={playerName}
        avatarId={avatarId}
        earnedSeals={earnedSeals}
        totalSeals={totalSeals}
        completionPercent={completionPercent}
        currentDestination={currentDestination}
        daysRemaining={daysRemaining}
        seasonStartsAt={seasonStartsAt}
        onChangeAvatar={() => setPickerOpen(true)}
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
