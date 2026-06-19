import { ArrowRight, Target, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { ssCard, ssLabel } from "./passport-dashboard-theme.ts";
import { PassportSealImage } from "./passport-seal-image.tsx";
import { PassportStatusBadge } from "./passport-status-badge.tsx";
import { sealBadgeStatus, type SealProgress } from "./passport-seal.ts";
import type { QuestEntry } from "./passport-types.ts";

/**
 * Prominent "what to do next" banner pointing at the closest incomplete seal.
 * Hidden once every seal is earned.
 */
export function PassportNextGoal({
  seal,
  actionableEntry,
  onViewSeal,
  onSubmitEvidence,
}: {
  seal: SealProgress | null;
  actionableEntry: QuestEntry | null;
  onViewSeal: (seal: SealProgress) => void;
  onSubmitEvidence: (entry: QuestEntry) => void;
}) {
  if (!seal) return null;

  const remaining = Math.max(0, seal.total - seal.approved);
  const badgeStatus = sealBadgeStatus(seal);

  return (
    <section
      className={cn(ssCard, "relative overflow-hidden")}
      aria-label="Next recommended seal"
    >
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: seal.meta.accent }}
        aria-hidden
      />
      <div className="flex flex-col gap-4 p-5 pl-6 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pl-7">
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${seal.meta.tint}cc` }}
          >
            <PassportSealImage meta={seal.meta} state={seal.state} size={56} showBadge={false} />
          </div>
          <div className="min-w-0">
            <p className={cn(ssLabel, "flex items-center gap-1.5 text-teal-700")}>
              <Target className="h-3.5 w-3.5" aria-hidden />
              Next goal
            </p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-stone-900">
              {seal.meta.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <PassportStatusBadge status={badgeStatus} withTooltip={false} />
              <span className="text-xs font-medium text-stone-600">
                {remaining === 0
                  ? "Awaiting final approval"
                  : `${remaining} requirement${remaining === 1 ? "" : "s"} remaining`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
          {actionableEntry ? (
            <Button
              className="min-h-10 touch-manipulation"
              onClick={() => onSubmitEvidence(actionableEntry)}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Submit evidence
            </Button>
          ) : null}
          <Button
            variant={actionableEntry ? "outline" : "default"}
            className="min-h-10 touch-manipulation"
            onClick={() => onViewSeal(seal)}
          >
            View challenge
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
