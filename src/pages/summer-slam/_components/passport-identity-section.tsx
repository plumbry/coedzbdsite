import { useState } from "react";
import { toast } from "sonner";
import { PassportAvatarPickerDialog } from "./passport-avatar-picker-dialog.tsx";
import { PassportIdentityCard } from "./passport-identity-card.tsx";
import { PassportProgressStats } from "./passport-hero.tsx";
import type { PassportAvatarId } from "./passport-avatars.ts";

export function PassportIdentitySection({
  playerName,
  avatarId,
  earnedSeals,
  totalSeals,
  completionPercent,
  onSaveAvatar,
  daysRemaining,
  approvedQuests,
  totalQuests,
  questPercent,
  currentDestination,
}: {
  playerName: string;
  avatarId: PassportAvatarId | null | undefined;
  earnedSeals: number;
  totalSeals: number;
  completionPercent: number;
  onSaveAvatar: (avatarId: PassportAvatarId) => Promise<void>;
  daysRemaining: number | null;
  approvedQuests: number;
  totalQuests: number;
  questPercent: number;
  currentDestination: string | null;
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
    <section aria-label="Player profile" className="mx-auto w-full max-w-sm space-y-4 px-2 sm:max-w-md">
      <PassportIdentityCard
        playerName={playerName}
        avatarId={avatarId}
        earnedSeals={earnedSeals}
        totalSeals={totalSeals}
        completionPercent={completionPercent}
        onChangeAvatar={() => setPickerOpen(true)}
      />

      <PassportProgressStats
        daysRemaining={daysRemaining}
        earnedSeals={earnedSeals}
        totalSeals={totalSeals}
        approvedQuests={approvedQuests}
        totalQuests={totalQuests}
        questPercent={questPercent}
        currentDestination={currentDestination}
        className="px-0"
      />

      <PassportAvatarPickerDialog
        open={pickerOpen}
        savedAvatarId={avatarId}
        isSaving={isSaving}
        onClose={() => setPickerOpen(false)}
        onSave={handleSave}
      />
    </section>
  );
}
