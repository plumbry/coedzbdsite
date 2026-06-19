import { cn } from "@/lib/utils.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import {
  ssCard,
  ssCardHover,
  ssSectionDesc,
  ssSectionTitle,
  ssStatusChip,
} from "./passport-dashboard-theme.ts";
import { sealStateLabel, type SealProgress } from "./passport-seal.ts";

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

  return (
    <button
      type="button"
      onClick={() => onSelect(seal)}
      className={cn(
        ssCard,
        ssCardHover,
        "flex flex-col items-center p-5 text-center touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
        isNext && "ring-1 ring-teal-400/50",
        earned && "shadow-[0_4px_20px_rgba(20,184,166,0.12)]",
      )}
      aria-label={`${meta.title} — ${sealStateLabel(state)}`}
    >
      {isNext ? (
        <span className="mb-3 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-teal-800">
          Up next
        </span>
      ) : (
        <span className="mb-3 h-[18px]" aria-hidden />
      )}

      <PassportSealImage meta={meta} state={state} size={88} showBadge />

      <h3 className="mt-4 text-sm font-semibold text-stone-900">{meta.label}</h3>
      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-snug text-stone-500">
        {meta.tagline}
      </p>

      <div className="mt-3 flex flex-col items-center gap-2">
        <span className={ssStatusChip(state)}>{sealStateLabel(state)}</span>
        {total > 0 && state !== "earned" ? (
          <span className="text-[11px] tabular-nums text-stone-500">
            {approved}/{total} tasks · {percent}%
          </span>
        ) : null}
      </div>
    </button>
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
        <h2 className={ssSectionTitle}>Seal collection</h2>
        <p className={ssSectionDesc}>
          Five official category seals. Earn each one by completing every challenge in that
          category.
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
