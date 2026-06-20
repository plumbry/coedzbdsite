import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { ssLabel } from "./passport-dashboard-theme.ts";
import { getDestination } from "./passport-destinations.ts";
import { getPassportAvatar, type PassportAvatarId } from "./passport-avatars.ts";
import {
  PASSPORT_BIRTHPLACES,
  type PassportBirthplaceId,
} from "./passport-birthplaces.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import { SEAL_BADGE_CONFIG } from "./passport-status-badge.tsx";
import { formatSealDate, sealBadgeStatus, type SealProgress } from "./passport-seal.ts";
import type { QuestCategory } from "./passport-types.ts";

const AVATAR_SIZE = 88;
const ZBD_LOGO_SRC = "/icon/co-ed-zbd-logo.jpg";
/** Stamp fills its grid cell, capped at target display size. */
const COLLECTION_STAMP_SLOT = "aspect-square w-full";

function StampedZbdLogo() {
  return (
    <div className="relative h-9 w-9 shrink-0 rotate-[-7deg] sm:h-10 sm:w-10">
      <img
        src={ZBD_LOGO_SRC}
        alt="ZBD"
        width={40}
        height={40}
        className="h-full w-full rounded-full object-cover opacity-[0.88] mix-blend-multiply contrast-[1.08] brightness-[0.96]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-35 [background:radial-gradient(circle_at_30%_25%,transparent_55%,rgba(40,30,20,0.1)_100%)] mix-blend-multiply"
      />
    </div>
  );
}

function CollectionSealButton({
  seal,
  isNext,
  isCelebrating,
  onSelect,
}: {
  seal: SealProgress;
  isNext: boolean;
  isCelebrating: boolean;
  onSelect: (seal: SealProgress) => void;
}) {
  const dest = getDestination(seal.id);
  const status = sealBadgeStatus(seal);
  const earned = seal.state === "earned";
  const statusTooltip = SEAL_BADGE_CONFIG[status].tooltip;

  return (
    <button
      type="button"
      onClick={() => onSelect(seal)}
      className={cn(
        "relative mx-auto w-full max-w-[68px] touch-manipulation sm:max-w-[78px]",
        "rounded-full transition-transform duration-150",
        "hover:scale-[1.04] active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[#FDFBF7]",
        isCelebrating && "motion-safe:animate-[stampImpact_0.7s_ease-out]",
      )}
      aria-label={`${dest.name} — ${SEAL_BADGE_CONFIG[status].label}. ${statusTooltip} Tap to view requirements and progress.`}
    >
      {isNext && !earned ? (
        <span className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-orange-500 px-1 py-px text-[7px] font-bold uppercase tracking-wide text-white">
          Next
        </span>
      ) : null}
      <PassportSealImage
        meta={seal.meta}
        state={seal.state}
        seal={seal}
        fill
        showBadge
        showProgressRing
        animateEarned={isCelebrating}
        className={COLLECTION_STAMP_SLOT}
      />
    </button>
  );
}

function passportHolderSlug(name: string) {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return slug.length > 0 ? slug.slice(0, 16) : "HOLDER";
}

function mrzPad(value: string, length: number) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();
  const base = clean.slice(0, length);
  return `${base}${"<".repeat(length)}`.slice(0, length);
}

function buildMrzLines(holderSlug: string, destination: string | null) {
  const dest = (destination ?? "Summer Finale").toUpperCase();
  return {
    line1: `P<SSP<${mrzPad(holderSlug, 30)}`,
    line2: `SS2026<SEASON01<${mrzPad(dest, 24)}`,
  };
}

function formatIssueDate(startsAt?: number) {
  if (!startsAt) return "Summer 2026";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
    new Date(startsAt),
  );
}

function formatExpiryDate(endsAt?: number) {
  if (!endsAt) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(endsAt));
}

function getLastStamped(seals: SealProgress[]) {
  const earned = seals
    .filter((seal) => seal.state === "earned" && seal.earnedAt != null)
    .sort((a, b) => (b.earnedAt ?? 0) - (a.earnedAt ?? 0));
  if (earned.length === 0) return null;
  const latest = earned[0]!;
  return {
    title: `${latest.meta.label} Stamp Earned`,
    date: formatSealDate(latest.earnedAt),
  };
}

function PassportPerforations() {
  const marks = Array.from({ length: 5 });
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-6 left-0 top-6 flex w-1.5 flex-col items-center justify-between py-0.5"
      >
        {marks.map((_, index) => (
          <span
            key={`l-${index}`}
            className="h-1 w-1 rounded-full bg-orange-300/35 shadow-[0_0_0_1px_rgba(255,252,248,0.8)]"
          />
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-6 right-0 top-6 flex w-1.5 flex-col items-center justify-between py-0.5"
      >
        {marks.map((_, index) => (
          <span
            key={`r-${index}`}
            className="h-1 w-1 rounded-full bg-orange-300/35 shadow-[0_0_0_1px_rgba(255,252,248,0.8)]"
          />
        ))}
      </div>
    </>
  );
}

function MetaField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-orange-800/42">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function StampCollectionPanel({
  seals,
  nextSealId,
  celebratingSealIds,
  onSelectSeal,
}: {
  seals: SealProgress[];
  nextSealId: QuestCategory | null;
  celebratingSealIds: string[];
  onSelectSeal: (seal: SealProgress) => void;
}) {
  const earnedCount = seals.filter((seal) => seal.state === "earned").length;

  return (
    <section aria-label="Summer Slam stamp collection" className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className={ssLabel}>Stamp Collection</p>
        <p className="text-xs font-bold tabular-nums tracking-wide text-teal-900">
          {earnedCount} / {seals.length} Collected
        </p>
      </div>
      <div className="grid w-full grid-cols-5 gap-[4px]">
        {seals.map((seal) => (
          <CollectionSealButton
            key={seal.id}
            seal={seal}
            isNext={seal.id === nextSealId}
            isCelebrating={celebratingSealIds.includes(seal.id)}
            onSelect={onSelectSeal}
          />
        ))}
      </div>
      <p className="text-[9px] text-orange-800/45">Tap a stamp for requirements & progress</p>
    </section>
  );
}

export function PassportIdentityCard({
  playerName,
  avatarId,
  birthplaceId,
  seals,
  completionPercent,
  currentDestination,
  seasonStartsAt,
  seasonEndsAt,
  nextSealId,
  celebratingSealIds,
  onSelectSeal,
  onChangeAvatar,
  onBirthplaceChange,
  isSavingBirthplace = false,
  className,
}: {
  playerName: string;
  avatarId: PassportAvatarId | null | undefined;
  birthplaceId: PassportBirthplaceId | null | undefined;
  seals: SealProgress[];
  completionPercent: number;
  currentDestination: string | null;
  seasonStartsAt?: number;
  seasonEndsAt?: number;
  nextSealId: QuestCategory | null;
  celebratingSealIds: string[];
  onSelectSeal: (seal: SealProgress) => void;
  onChangeAvatar: () => void;
  onBirthplaceChange: (birthplaceId: PassportBirthplaceId) => void;
  isSavingBirthplace?: boolean;
  className?: string;
}) {
  const avatar = getPassportAvatar(avatarId);
  const passportNo = `SS-2026-${passportHolderSlug(playerName)}`;
  const issueDate = formatIssueDate(seasonStartsAt);
  const holderSlug = passportHolderSlug(playerName);
  const mrz = buildMrzLines(holderSlug, currentDestination);
  const lastStamped = getLastStamped(seals);
  const destinationLabel = currentDestination ?? "Summer Finale";
  const expiryDate = formatExpiryDate(seasonEndsAt);

  return (
    <section
      aria-label="Summer Slam passport"
      className={cn("relative mx-auto w-full max-w-2xl px-3 sm:px-4", className)}
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
          className="pointer-events-none absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(120,100,80,0.55) 0 1px, transparent 1px 14px)",
          }}
        />

        <PassportPerforations />

        <div
          aria-hidden
          className="pointer-events-none absolute -right-1 bottom-8 rotate-[-14deg] select-none text-right opacity-[0.09]"
        >
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-orange-900">
            Summer Slam
          </p>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.35em] text-teal-900">
            Summer 2026
          </p>
        </div>

        <div className="relative border-b border-dashed border-orange-200/70 px-3.5 py-2 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] uppercase tracking-[0.12em] text-orange-800/40">
              Issued {issueDate}
            </p>
            <div className="shrink-0 text-right">
              <p className="text-[8px] font-semibold uppercase tracking-[0.24em] text-orange-800/40">
                Season 01
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800/55">
                Summer 2026
              </p>
            </div>
          </div>
        </div>

        <div className="relative p-3 sm:p-3.5">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-0">
            <div className="flex min-w-0 flex-col gap-3 sm:pr-4">
              <div className="flex items-start gap-3">
                {avatar ? (
                  <button
                    type="button"
                    onClick={onChangeAvatar}
                    className="relative shrink-0 touch-manipulation"
                    aria-label="Change avatar"
                  >
                    <img
                      src={avatar.image}
                      alt=""
                      width={AVATAR_SIZE}
                      height={AVATAR_SIZE}
                      className="rounded-full object-contain drop-shadow-[0_2px_8px_rgba(60,50,40,0.14)]"
                      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onChangeAvatar}
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full",
                      "border border-dashed border-orange-300/55 bg-orange-50/30",
                      "text-[8px] font-medium uppercase leading-tight tracking-wide text-orange-400/80",
                      "transition-colors hover:border-orange-400/70 hover:bg-orange-50/50 touch-manipulation",
                    )}
                    style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                    aria-label="Select avatar"
                  >
                    Select
                  </button>
                )}

                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="font-display text-lg font-semibold uppercase leading-tight tracking-[0.04em] text-orange-950 sm:text-xl">
                    {playerName}
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-orange-800/55">
                    Summer Slam Passport Holder
                  </p>
                  <button
                    type="button"
                    onClick={onChangeAvatar}
                    className="mt-1 text-[10px] font-semibold text-teal-800/65 underline-offset-2 hover:text-teal-900 hover:underline touch-manipulation"
                  >
                    Change avatar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-orange-200/45 bg-white/35 px-2.5 py-2">
                <MetaField label="Passport No.">
                  <p className="font-mono text-[11px] font-semibold tracking-[0.04em] text-orange-950/80">
                    {passportNo}
                  </p>
                </MetaField>

                <MetaField label="Current Destination">
                  <p className="text-[11px] font-semibold text-orange-950">{destinationLabel}</p>
                </MetaField>

                <MetaField label="Birthplace">
                  <Select
                    value={birthplaceId ?? undefined}
                    onValueChange={(value) => onBirthplaceChange(value as PassportBirthplaceId)}
                    disabled={isSavingBirthplace}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-7 w-full border-0 border-b border-dashed border-orange-300/45 bg-transparent px-0",
                        "text-[11px] font-medium text-orange-950/85 shadow-none rounded-none",
                        "focus:ring-0 focus:ring-offset-0 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-40",
                        "touch-manipulation",
                      )}
                    >
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {PASSPORT_BIRTHPLACES.map((place) => (
                        <SelectItem key={place.id} value={place.id}>
                          {place.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </MetaField>

                <MetaField label="Last Stamped">
                  {lastStamped ? (
                    <div>
                      <p className="text-[11px] font-semibold leading-tight text-orange-950">
                        {lastStamped.title}
                      </p>
                      {lastStamped.date ? (
                        <p className="text-[10px] tabular-nums text-orange-800/60">{lastStamped.date}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[11px] text-orange-800/50">Not yet stamped</p>
                  )}
                </MetaField>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-3 border-t border-dashed border-orange-200/55 pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <StampCollectionPanel
                seals={seals}
                nextSealId={nextSealId}
                celebratingSealIds={celebratingSealIds}
                onSelectSeal={onSelectSeal}
              />

              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={ssLabel}>Journey Completion</p>
                  <p className="text-xs font-bold tabular-nums text-orange-950/85">{completionPercent}%</p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-orange-100/90">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-400 to-teal-500 transition-[width] duration-700"
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-orange-950/85">
                <span className={cn(ssLabel, "mr-1.5")}>Expiry Date</span>
                <span className="font-bold tabular-nums text-orange-950">
                  {expiryDate ?? "TBA"}
                </span>
              </p>

              <div className="mt-auto space-y-0.5">
                <p className="text-[8px] font-semibold uppercase tracking-[0.22em] text-orange-800/35">
                  Issuing Authority
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-teal-800/40">
                  Summer Slam Passport Office
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-end gap-3 border-t border-dashed border-orange-200/55 px-3.5 py-2 sm:px-4">
          <div className="shrink-0 pb-0.5">
            <StampedZbdLogo />
          </div>
          <div
            aria-hidden
            className="min-w-0 flex-1 overflow-hidden font-mono text-[8px] font-medium uppercase leading-[1.55] tracking-[0.06em] text-orange-900/28 sm:text-[9px]"
          >
            <p className="truncate">{mrz.line1}</p>
            <p className="truncate">{mrz.line2}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
