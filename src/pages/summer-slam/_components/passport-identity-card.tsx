import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { ssLabel } from "./passport-dashboard-theme.ts";
import { getPassportAvatar, type PassportAvatarId } from "./passport-avatars.ts";
import {
  PASSPORT_BIRTHPLACES,
  type PassportBirthplaceId,
} from "./passport-birthplaces.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import { PassportStampCelebration } from "./passport-stamp-celebration.tsx";
import { SEAL_BADGE_CONFIG } from "./passport-status-badge.tsx";
import { BONUS_STAMP_META } from "./passport-bonus-stamp.ts";
import { formatSealDate, sealBadgeStatus, type SealProgress } from "./passport-seal.ts";
import type { PassportTier } from "./passport-levels.ts";

const AVATAR_CLASS =
  "size-24 shrink-0 rounded-full object-contain drop-shadow-[0_2px_8px_rgba(60,50,40,0.14)] lg:size-[7.75rem]";
const AVATAR_PLACEHOLDER_CLASS =
  "flex size-24 shrink-0 items-center justify-center rounded-full border border-dashed border-orange-300/55 bg-orange-50/30 text-[8px] font-medium uppercase leading-tight tracking-wide text-orange-400/80 lg:size-[7.75rem] lg:text-[10px]";
const ZBD_LOGO_SRC = "/icon/co-ed-zbd-logo.jpg";
const STAMP_BTN_CLASS =
  "relative mx-auto w-full max-w-[72px] touch-manipulation sm:max-w-[76px] lg:max-w-[96px] xl:max-w-[104px]";
const STAMP_COLUMN_CLASS =
  "mx-auto flex w-full max-w-[72px] flex-col items-center gap-0.5 sm:max-w-[76px] lg:max-w-[96px] xl:max-w-[104px]";
const STAMP_LABEL_CLASS =
  "w-full text-center text-[8px] font-semibold leading-tight text-orange-900/55 lg:text-[10px]";
const STAMP_PROGRESS_CLASS =
  "w-full text-center text-[9px] font-bold tabular-nums text-teal-800/70 lg:text-[11px]";

/** Stamp fills its grid cell, capped at target display size. */
const COLLECTION_STAMP_SLOT = "aspect-square w-full";

function StampedZbdLogo() {
  return (
    <div className="relative h-9 w-9 shrink-0 rotate-[-7deg] sm:h-10 sm:w-10 lg:h-12 lg:w-12">
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
  isCelebrating,
  onSelect,
}: {
  seal: SealProgress;
  isCelebrating: boolean;
  onSelect: (seal: SealProgress) => void;
}) {
  const status = sealBadgeStatus(seal);
  const statusTooltip = SEAL_BADGE_CONFIG[status].tooltip;
  const progressLabel =
    seal.total > 0 ? `${seal.approved}/${seal.total}` : seal.state === "earned" ? "Done" : "?";

  return (
    <div className={STAMP_COLUMN_CLASS}>
      <button
        type="button"
        onClick={() => onSelect(seal)}
        className={cn(
          STAMP_BTN_CLASS,
          "rounded-full transition-transform duration-150",
          "hover:scale-[1.04] active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[#FDFBF7]",
          isCelebrating && "motion-safe:animate-[stampImpact_0.7s_ease-out]",
        )}
        aria-label={`${seal.meta.label} \u00b7 ${SEAL_BADGE_CONFIG[status].label}. ${statusTooltip} Tap to open this passport page.`}
      >
        <PassportStampCelebration active={isCelebrating} />
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
      <p className={cn(STAMP_LABEL_CLASS, "truncate")}>{seal.meta.label}</p>
      <p className={STAMP_PROGRESS_CLASS}>{progressLabel}</p>
    </div>
  );
}

function BonusSealButton({
  onSelect,
  revealed,
}: {
  onSelect: () => void;
  revealed: boolean;
}) {
  if (!revealed) return null;

  return (
    <div className="col-span-5 mt-1 flex justify-center sm:col-span-1 sm:mt-0">
      <div className={STAMP_COLUMN_CLASS}>
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            STAMP_BTN_CLASS,
            "rounded-full transition-transform duration-150 motion-safe:animate-[sealPop_0.6s_ease-out]",
            "hover:scale-[1.04] active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-1",
          )}
          aria-label="Summer Legend bonus stamp ? tap to open hidden page"
        >
          <PassportSealImage
            meta={{
              id: "summer_spirit",
              label: BONUS_STAMP_META.label,
              title: BONUS_STAMP_META.title,
              tagline: BONUS_STAMP_META.tagline,
              image: "",
              accent: BONUS_STAMP_META.accent,
              tint: BONUS_STAMP_META.tint,
              glow: "",
              text: "text-amber-600",
            }}
            state="locked"
            fill
            showBadge={false}
            className={COLLECTION_STAMP_SLOT}
          />
        </button>
        <p className={cn(STAMP_LABEL_CLASS, "text-amber-800/70")}>{BONUS_STAMP_META.label}</p>
        <p className={cn(STAMP_PROGRESS_CLASS, "text-amber-700/60")}>Bonus</p>
      </div>
    </div>
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

function buildMrzLines(holderSlug: string) {
  return {
    line1: `P<SSP<${mrzPad(holderSlug, 30)}`,
    line2: `SS2026<SEASON01<SUMMER<SLAM<PASSPORT`,
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
      <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-orange-800/42 lg:text-[9px]">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function StampCollectionPanel({
  seals,
  celebratingSealIds,
  bonusUnlocked,
  onSelectSeal,
  onSelectBonus,
}: {
  seals: SealProgress[];
  celebratingSealIds: string[];
  bonusUnlocked: boolean;
  onSelectSeal: (seal: SealProgress) => void;
  onSelectBonus: () => void;
}) {
  const earnedCount = seals.filter((seal) => seal.state === "earned").length;

  return (
    <section aria-label="Summer Slam stamp collection" className="space-y-1.5 lg:space-y-2.5 lg:flex-1 lg:flex lg:flex-col lg:justify-center">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn(ssLabel, "lg:text-[11px]")}>Stamp Collection</p>
        <p className="text-xs font-bold tabular-nums tracking-wide text-teal-900 lg:text-sm">
          {earnedCount} / {seals.length} Collected
        </p>
      </div>
      <div className="grid w-full grid-cols-5 gap-[4px] lg:gap-2">
        {seals.map((seal) => (
          <CollectionSealButton
            key={seal.id}
            seal={seal}
            isCelebrating={celebratingSealIds.includes(seal.id)}
            onSelect={onSelectSeal}
          />
        ))}
        <BonusSealButton revealed={bonusUnlocked} onSelect={onSelectBonus} />
      </div>
      <p className="text-[9px] text-center text-orange-800/45 lg:text-[11px]">Tap a stamp to open its passport page</p>
    </section>
  );
}

function PassportSummaryStrip({
  tier,
  questPoints,
  completionPercent,
  pagesCompleted,
  totalPages,
}: {
  tier: PassportTier;
  questPoints: number;
  completionPercent: number;
  pagesCompleted: number;
  totalPages: number;
}) {
  return (
    <div className="rounded-lg border border-orange-200/50 bg-white/45 px-2.5 py-2 lg:px-3.5 lg:py-3">
      <p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-orange-800/40 lg:text-[9px]">
        Summer Slam Passport
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 lg:mt-1.5">
        <p className="font-display text-sm font-bold text-orange-950 lg:text-base">
          Level {tier.level}
          <span className="ml-1.5 text-[11px] font-semibold text-teal-800/75 lg:text-sm">{tier.title}</span>
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-medium text-orange-900/70 lg:mt-2 lg:text-xs">
        <span>
          <span className="font-bold tabular-nums text-orange-950">{questPoints}</span> Quest Points
        </span>
        <span>
          <span className="font-bold tabular-nums text-orange-950">{completionPercent}%</span> Complete
        </span>
        <span>
          <span className="font-bold tabular-nums text-orange-950">
            {pagesCompleted}/{totalPages}
          </span>{" "}
          Pages Completed
        </span>
      </div>
    </div>
  );
}

export function PassportIdentityCard({
  playerName,
  avatarId,
  birthplaceId,
  seals,
  completionPercent,
  questPoints,
  passportTier,
  pagesCompleted,
  totalPages,
  bonusUnlocked,
  seasonStartsAt,
  seasonEndsAt,
  celebratingSealIds,
  onSelectSeal,
  onSelectBonus,
  onChangeAvatar,
  onBirthplaceChange,
  isSavingBirthplace = false,
  readOnly = false,
  children,
  className,
}: {
  playerName: string;
  avatarId: PassportAvatarId | null | undefined;
  birthplaceId: PassportBirthplaceId | null | undefined;
  seals: SealProgress[];
  completionPercent: number;
  questPoints: number;
  passportTier: PassportTier;
  pagesCompleted: number;
  totalPages: number;
  bonusUnlocked: boolean;
  seasonStartsAt?: number;
  seasonEndsAt?: number;
  celebratingSealIds: string[];
  onSelectSeal: (seal: SealProgress) => void;
  onSelectBonus: () => void;
  onChangeAvatar?: () => void;
  onBirthplaceChange?: (birthplaceId: PassportBirthplaceId) => void;
  isSavingBirthplace?: boolean;
  readOnly?: boolean;
  /** When set, replaces cover content (passport page spread). */
  children?: ReactNode;
  className?: string;
}) {
  const avatar = getPassportAvatar(avatarId);
  const canEditAvatar = !readOnly && Boolean(onChangeAvatar);
  const canEditBirthplace = !readOnly && Boolean(onBirthplaceChange);
  const birthplaceLabel =
    PASSPORT_BIRTHPLACES.find((place) => place.id === birthplaceId)?.label ?? null;
  const passportNo = `SS-2026-${passportHolderSlug(playerName)}`;
  const issueDate = formatIssueDate(seasonStartsAt);
  const holderSlug = passportHolderSlug(playerName);
  const mrz = buildMrzLines(holderSlug);
  const lastStamped = getLastStamped(seals);
  const expiryDate = formatExpiryDate(seasonEndsAt);
  const pageOpen = Boolean(children);

  return (
    <section
      aria-label="Summer Slam passport"
      className={cn(
        "relative w-full max-w-2xl px-0 sm:px-4 lg:flex lg:h-full lg:max-w-none lg:flex-col lg:px-0",
        className,
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 border-double",
          "border-orange-300/45 bg-[#FDFBF7]",
          "shadow-[0_4px_24px_rgba(120,90,60,0.08),inset_0_0_0_1px_rgba(255,255,255,0.65)]",
          "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col",
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

        <div className="relative shrink-0 border-b border-dashed border-orange-200/70 px-3.5 py-2 sm:px-4 lg:px-5 lg:py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] uppercase tracking-[0.12em] text-orange-800/40 lg:text-[10px]">
              Issued {issueDate}
            </p>
            <div className="shrink-0 text-right">
              <p className="text-[8px] font-semibold uppercase tracking-[0.24em] text-orange-800/40 lg:text-[9px]">
                Season 01
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800/55 lg:text-xs">
                Summer 2026
              </p>
            </div>
          </div>
        </div>

        <div className="relative flex flex-col p-3 sm:p-4 lg:min-h-0 lg:flex-1 lg:p-5">
          <div
            className={cn(
              "flex flex-col gap-5 lg:min-h-0 lg:flex-1",
              pageOpen && "pointer-events-none invisible",
            )}
            aria-hidden={pageOpen || undefined}
          >
        <div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1">
          <div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1 lg:grid lg:grid-cols-2 lg:gap-5">
            <div className="flex min-w-0 flex-col gap-4 lg:justify-between lg:gap-5 lg:py-1">
              <PassportSummaryStrip
                tier={passportTier}
                questPoints={questPoints}
                completionPercent={completionPercent}
                pagesCompleted={pagesCompleted}
                totalPages={totalPages}
              />

              <div className="flex items-start gap-3 lg:gap-4">
                {avatar ? (
                  canEditAvatar ? (
                    <button
                      type="button"
                      onClick={onChangeAvatar}
                      className="relative shrink-0 touch-manipulation"
                      aria-label="Change avatar"
                    >
                      <img src={avatar.image} alt="" width={124} height={124} className={AVATAR_CLASS} />
                    </button>
                  ) : (
                    <img src={avatar.image} alt="" width={124} height={124} className={AVATAR_CLASS} />
                  )
                ) : canEditAvatar ? (
                  <button
                    type="button"
                    onClick={onChangeAvatar}
                    className={cn(
                      AVATAR_PLACEHOLDER_CLASS,
                      "transition-colors hover:border-orange-400/70 hover:bg-orange-50/50 touch-manipulation",
                    )}
                    aria-label="Select avatar"
                  >
                    Select
                  </button>
                ) : (
                  <div aria-hidden className={AVATAR_PLACEHOLDER_CLASS}>
                    Select
                  </div>
                )}

                <div className="min-w-0 flex-1 pt-0.5 lg:pt-1">
                  <p className="font-display text-lg font-semibold uppercase leading-tight tracking-[0.04em] text-orange-950 sm:text-xl lg:text-2xl">
                    {playerName}
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-orange-800/55 lg:text-xs">
                    Summer Slam Passport Holder
                  </p>
                  {canEditAvatar ? (
                    <button
                      type="button"
                      onClick={onChangeAvatar}
                      className="mt-1 text-[10px] font-semibold text-teal-800/65 underline-offset-2 hover:text-teal-900 hover:underline touch-manipulation lg:text-xs"
                    >
                      Change avatar
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-orange-200/45 bg-white/35 px-2.5 py-2 lg:gap-x-4 lg:gap-y-3 lg:px-3.5 lg:py-3">
                <MetaField label="Passport No.">
                  <p className="font-mono text-[11px] font-semibold tracking-[0.04em] text-orange-950/80 lg:text-xs">
                    {passportNo}
                  </p>
                </MetaField>

                <MetaField label="Passport Level">
                  <p className="text-[11px] font-semibold text-orange-950 lg:text-xs">
                    Level {passportTier.level}
                    {" \u00b7 "}
                    {passportTier.title}
                  </p>
                </MetaField>

                <MetaField label="Birthplace">
                  {canEditBirthplace ? (
                    <Select
                      value={birthplaceId ?? undefined}
                      onValueChange={(value) => onBirthplaceChange?.(value as PassportBirthplaceId)}
                      disabled={isSavingBirthplace}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-7 w-full border-0 border-b border-dashed border-orange-300/45 bg-transparent px-0",
                          "text-[11px] font-medium text-orange-950/85 shadow-none rounded-none lg:h-8 lg:text-xs",
                          "focus:ring-0 focus:ring-offset-0 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-40",
                          "touch-manipulation",
                        )}
                      >
                        <SelectValue placeholder="Select birthplace?" />
                      </SelectTrigger>
                      <SelectContent>
                        {PASSPORT_BIRTHPLACES.map((place) => (
                          <SelectItem key={place.id} value={place.id}>
                            {place.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-[11px] font-medium text-orange-950/85 lg:text-xs">
                      {birthplaceLabel ?? "?"}
                    </p>
                  )}
                </MetaField>

                <MetaField label="Last Stamped">
                  {lastStamped ? (
                    <div>
                      <p className="text-[11px] font-semibold leading-tight text-orange-950 lg:text-xs">
                        {lastStamped.title}
                      </p>
                      {lastStamped.date ? (
                        <p className="text-[10px] tabular-nums text-orange-800/60 lg:text-[11px]">{lastStamped.date}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[11px] text-orange-800/50">Not yet stamped</p>
                  )}
                </MetaField>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-4 border-t border-dashed border-orange-200/55 pt-5 lg:justify-between lg:gap-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 lg:py-1">
              <StampCollectionPanel
                seals={seals}
                celebratingSealIds={celebratingSealIds}
                bonusUnlocked={bonusUnlocked}
                onSelectSeal={onSelectSeal}
                onSelectBonus={onSelectBonus}
              />

              <div className="space-y-3 lg:mt-auto lg:space-y-3">
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn(ssLabel, "lg:text-[11px]")}>Passport Completion</p>
                  <p className="text-xs font-bold tabular-nums text-orange-950/85 lg:text-sm">{completionPercent}%</p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-orange-100/90 lg:h-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-400 to-teal-500 transition-[width] duration-700"
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-orange-950/85 lg:text-xs">
                <span className={cn(ssLabel, "mr-1.5 lg:text-[11px]")}>Expiry Date</span>
                <span className="font-bold tabular-nums text-orange-950">
                  {expiryDate ?? "TBA"}
                </span>
              </p>

              <div className="space-y-0.5">
                <p className="text-[8px] font-semibold uppercase tracking-[0.22em] text-orange-800/35 lg:text-[9px]">
                  Issuing Authority
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-teal-800/40 lg:text-[10px]">
                  Summer Slam Passport Office
                </p>
              </div>
              </div>
            </div>
          </div>
          </div>
          </div>

          {pageOpen ? (
            <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden">
              {children}
            </div>
          ) : null}
        </div>

        <div className="relative flex shrink-0 items-end gap-3 border-t border-dashed border-orange-200/55 px-3.5 py-2 sm:px-4 lg:px-5 lg:py-2.5">
          <div className="shrink-0 pb-0.5">
            <StampedZbdLogo />
          </div>
          <div
            aria-hidden
            className="min-w-0 flex-1 overflow-hidden font-mono text-[8px] font-medium uppercase leading-[1.55] tracking-[0.06em] text-orange-900/28 sm:text-[9px] lg:text-[10px]"
          >
            <p className="truncate">{mrz.line1}</p>
            <p className="truncate">{mrz.line2}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
