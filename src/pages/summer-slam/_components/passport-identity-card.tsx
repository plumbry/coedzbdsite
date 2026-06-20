import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { getPassportAvatar, type PassportAvatarId } from "./passport-avatars.ts";

export function PassportIdentityCard({
  playerName,
  avatarId,
  earnedSeals,
  totalSeals,
  completionPercent,
  onChangeAvatar,
  className,
}: {
  playerName: string;
  avatarId: PassportAvatarId | null | undefined;
  earnedSeals: number;
  totalSeals: number;
  completionPercent: number;
  onChangeAvatar: () => void;
  className?: string;
}) {
  const avatar = getPassportAvatar(avatarId);

  return (
    <section
      aria-label="Passport identity"
      className={cn("relative mx-auto w-full max-w-xs px-2 sm:max-w-sm", className)}
    >
      <div className="relative flex flex-col items-center">
        <div className="relative z-10 -mb-7 flex flex-col items-center">
          <div
            className={cn(
              "relative flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full",
              "border-[3px] border-white bg-gradient-to-b from-[#FFF8F0] to-[#F0FAFA]",
              "shadow-[0_4px_16px_rgba(14,165,233,0.18)] sm:h-20 sm:w-20",
              avatar ? "ring-2 ring-sky-400/40" : "ring-2 ring-dashed ring-orange-200/80",
            )}
          >
            {avatar ? (
              <img
                src={avatar.image}
                alt=""
                width={80}
                height={80}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[10px] font-medium uppercase tracking-wide text-orange-400/70">
                Photo
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onChangeAvatar}
            className={cn(
              "mt-1.5 h-7 px-2.5 text-[11px] font-semibold text-sky-700",
              "hover:bg-sky-50 hover:text-sky-800 touch-manipulation",
            )}
          >
            Change Avatar
          </Button>
        </div>

        <div
          className={cn(
            "w-full rounded-xl border border-orange-200/60 bg-gradient-to-b from-[#FFFCF8] to-white",
            "px-4 pb-3.5 pt-10 text-center",
            "shadow-[0_2px_12px_rgba(249,115,22,0.08)]",
          )}
        >
          <p className="truncate font-display text-base font-semibold tracking-[0.01em] text-orange-950 sm:text-lg">
            {playerName}
          </p>

          <div className="mt-2.5 space-y-0.5">
            <p className="text-sm font-semibold tabular-nums text-teal-800">
              {earnedSeals} / {totalSeals} Seals Earned
            </p>
            <p className="text-xs font-medium tabular-nums text-orange-800/65">
              {completionPercent}% Complete
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
