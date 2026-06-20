import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { ssLabel } from "./passport-dashboard-theme.ts";
import { getPassportAvatar, type PassportAvatarId } from "./passport-avatars.ts";

function passportHolderSlug(name: string) {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return slug.length > 0 ? slug.slice(0, 16) : "HOLDER";
}

function formatIssueDate(startsAt?: number) {
  if (!startsAt) return "Summer 2026";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
    new Date(startsAt),
  );
}

function StampCollectionRow({ earned, total }: { earned: number; total: number }) {
  return (
    <div className="space-y-1">
      <p className={ssLabel}>Stamp Collection</p>
      <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, index) => {
          const collected = index < earned;
          return (
            <span
              key={index}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border text-base leading-none",
                collected
                  ? "border-teal-500/70 bg-teal-50 text-teal-600 shadow-[inset_0_0_0_1px_rgba(20,184,166,0.15)]"
                  : "border-orange-300/50 bg-[#FFFCF8] text-orange-300/90",
              )}
            >
              {collected ? "●" : "○"}
            </span>
          );
        })}
      </div>
      <p className="text-xs font-semibold tabular-nums text-teal-900/85">
        {earned} / {total} Collected
      </p>
    </div>
  );
}

export function PassportIdentityCard({
  playerName,
  avatarId,
  earnedSeals,
  totalSeals,
  completionPercent,
  currentDestination,
  daysRemaining,
  seasonStartsAt,
  onChangeAvatar,
  className,
}: {
  playerName: string;
  avatarId: PassportAvatarId | null | undefined;
  earnedSeals: number;
  totalSeals: number;
  completionPercent: number;
  currentDestination: string | null;
  daysRemaining: number | null;
  seasonStartsAt?: number;
  onChangeAvatar: () => void;
  className?: string;
}) {
  const avatar = getPassportAvatar(avatarId);
  const passportNo = `SS-2026-${passportHolderSlug(playerName)}`;
  const issueDate = formatIssueDate(seasonStartsAt);

  return (
    <section
      aria-label="Summer Slam passport"
      className={cn("relative mx-auto w-full max-w-3xl px-1", className)}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 border-double",
          "border-orange-300/45 bg-[#FDFBF7]",
          "shadow-[0_4px_24px_rgba(120,90,60,0.08),inset_0_0_0_1px_rgba(255,255,255,0.65)]",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(120,100,80,0.55) 0 1px, transparent 1px 14px)",
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute -right-1 bottom-4 rotate-[-14deg] select-none text-right opacity-[0.09]"
        >
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-orange-900">
            Summer Slam
          </p>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.35em] text-teal-900">
            Summer 2026
          </p>
        </div>

        <div className="relative border-b border-dashed border-orange-200/70 px-4 py-2.5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-orange-900/45">
            <span>
              Passport No. <span className="text-orange-950/70">{passportNo}</span>
            </span>
            <span className="text-teal-800/55">Summer Edition</span>
          </div>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-orange-800/40">
            Issued {issueDate}
          </p>
        </div>

        <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-6 sm:p-5">
          <div className="flex shrink-0 flex-col items-center sm:items-start">
            <div
              className={cn(
                "relative flex h-[5.5rem] w-[4.25rem] items-center justify-center overflow-hidden",
                "border-[3px] border-white bg-[#F8F6F2]",
                "shadow-[0_2px_10px_rgba(60,50,40,0.14),0_0_0_1px_rgba(180,150,120,0.25)]",
                "sm:h-28 sm:w-[5.5rem]",
                !avatar && "border-dashed border-orange-200/90",
              )}
            >
              {avatar ? (
                <img
                  src={avatar.image}
                  alt=""
                  width={88}
                  height={112}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="px-2 text-center text-[9px] font-medium uppercase leading-tight tracking-wide text-orange-400/80">
                  Passport Photo
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onChangeAvatar}
              className={cn(
                "mt-2.5 h-8 border-orange-200/80 bg-white/80 px-3 text-[11px] font-semibold text-orange-900/80",
                "hover:border-orange-300 hover:bg-orange-50/80 touch-manipulation",
              )}
            >
              Change Avatar
            </Button>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <p className="font-display text-xl font-semibold uppercase tracking-[0.04em] text-orange-950 sm:text-2xl">
                {playerName}
              </p>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.18em] text-orange-800/55">
                Summer Slam Passport Holder
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <StampCollectionRow earned={earnedSeals} total={totalSeals} />

              <div className="space-y-1">
                <p className={ssLabel}>Journey Completion</p>
                <p className="text-lg font-bold tabular-nums text-orange-950">{completionPercent}%</p>
                <div className="h-1.5 w-full max-w-[8rem] overflow-hidden rounded-full bg-orange-100/90">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-400 to-teal-500 transition-[width] duration-700"
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <p className={cn(ssLabel, "flex items-center gap-1 text-orange-800/70")}>
                  <MapPin className="h-3 w-3 text-orange-500" aria-hidden />
                  Current Destination
                </p>
                <p className="font-display text-base font-semibold tracking-[0.02em] text-orange-950 sm:text-lg">
                  {currentDestination ?? "Summer Finale"}
                </p>
              </div>

              {daysRemaining != null ? (
                <div className="space-y-1">
                  <p className={ssLabel}>Time Remaining</p>
                  <p className="text-sm font-bold tabular-nums text-orange-950">
                    {daysRemaining} {daysRemaining === 1 ? "Day" : "Days"}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
