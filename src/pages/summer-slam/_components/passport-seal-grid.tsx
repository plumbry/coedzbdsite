import { MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { PassportSealImage } from "./passport-seal-image.tsx";
import { InfoTooltip } from "./passport-info-tooltip.tsx";
import { PassportStatusBadge, SEAL_BADGE_CONFIG } from "./passport-status-badge.tsx";
import { ssCard, ssInteractiveCard, ssSectionTitle } from "./passport-dashboard-theme.ts";
import { sealBadgeStatus, type SealProgress } from "./passport-seal.ts";

function SealCard({
  seal,
  isNext,
  onSelect,
}: {
  seal: SealProgress;
  isNext: boolean;
  onSelect: (seal: SealProgress) => void;
}) {
  const { meta, state, approved, total, percent } = seal;
  const earned = state === "earned";
  const badgeStatus = sealBadgeStatus(seal);
  const tooltip = SEAL_BADGE_CONFIG[badgeStatus].tooltip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(seal)}
          className={cn(
            ssCard,
            ssInteractiveCard,
            "relative flex flex-col items-center p-5 text-center touch-manipulation",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2",
            isNext && "ring-2 ring-teal-400/60",
            earned && "shadow-[0_4px_20px_rgba(20,184,166,0.12)]",
          )}
          aria-label={`${meta.title} — ${SEAL_BADGE_CONFIG[badgeStatus].label}. ${tooltip} Click to view requirements and progress.`}
        >
          {isNext ? (
            <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-teal-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm">
              Up next
            </span>
          ) : null}

          <span className="mt-3">
            <PassportSealImage
              meta={meta}
              state={state}
              size={92}
              showBadge
              className="transition-transform duration-200 group-hover/seal:scale-105"
            />
          </span>

          <h3 className="mt-4 text-sm font-semibold text-stone-900">{meta.label}</h3>
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-snug text-stone-500">
            {meta.tagline}
          </p>

          <div className="mt-3 flex flex-col items-center gap-2">
            <PassportStatusBadge status={badgeStatus} withTooltip={false} />
            {total > 0 && !earned ? (
              <span className="text-[11px] tabular-nums text-stone-500">
                {approved}/{total} done · {percent}%
              </span>
            ) : null}
          </div>

          <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 opacity-0 transition-opacity duration-200 group-hover/seal:opacity-100">
            <MousePointerClick className="h-3 w-3" aria-hidden />
            View details
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[14rem]">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function PassportSealGrid({
  seals,
  nextSealId,
  onSelect,
}: {
  seals: SealProgress[];
  nextSealId: string | null;
  onSelect: (seal: SealProgress) => void;
}) {
  return (
    <section aria-label="Seal collection">
      <div className="mb-4">
        <div className="flex items-center gap-1.5">
          <h2 className={ssSectionTitle}>Seal collection</h2>
          <InfoTooltip
            label="About the seal collection"
            text="Collect seals by completing Summer Slam challenges."
          />
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Collect seals by completing Summer Slam challenges.{" "}
          <span className="font-medium text-stone-700">
            Click any seal to view requirements and progress.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
        {seals.map((seal) => (
          <SealCard
            key={seal.id}
            seal={seal}
            isNext={seal.id === nextSealId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
