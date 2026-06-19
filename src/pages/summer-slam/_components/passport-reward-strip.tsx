import { Progress } from "@/components/ui/progress.tsx";
import { ArrowRight, Stamp, Ticket, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";
import { computeNextBigEntry } from "./passport-types.ts";

export function PassportRewardStrip({
  approvedStamps,
  totalStamps,
  littleWheelEntries,
  bigWheelEntries,
  bigWheelEveryStamps,
  embedded = false,
  compact = false,
}: {
  approvedStamps: number;
  totalStamps: number;
  littleWheelEntries: number;
  bigWheelEntries: number;
  bigWheelEveryStamps: number;
  embedded?: boolean;
  compact?: boolean;
}) {
  const progressPct = totalStamps > 0 ? Math.round((approvedStamps / totalStamps) * 100) : 0;
  const remaining = Math.max(0, totalStamps - approvedStamps);
  const nextBig = computeNextBigEntry(approvedStamps, bigWheelEveryStamps);
  const nextBigPct =
    nextBig.target > 0 ? Math.round((nextBig.current / nextBig.target) * 100) : 0;
  const stampsToNextBig =
    nextBig.remaining === nextBig.target && approvedStamps > 0 && nextBig.current === 0
      ? nextBig.target
      : nextBig.remaining;

  return (
    <section
      className={cn(
        embedded
          ? "pt-1"
          : "rounded-2xl border border-amber-300/50 bg-gradient-to-br from-amber-50 via-[#FFFBF5] to-orange-50/80 p-3.5 shadow-[0_4px_20px_rgba(251,191,36,0.12)] md:p-4",
        compact && !embedded && "p-3",
      )}
      aria-label="Stamp rewards and prize entries"
    >
      {!embedded ? (
        <div className="mb-3 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-[0.28em] text-amber-800/80">
            Collect stamps · Win prizes
          </p>
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-black tabular-nums leading-none text-slate-900 md:text-5xl">
                {approvedStamps}
              </span>
              <span className="pb-1 text-base font-semibold text-slate-500 md:text-lg">
                / {totalStamps} stamps
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-800">
                {remaining === 0 ? "Passport complete!" : `${remaining} more to go`}
              </p>
              <p className="text-xs tabular-nums text-slate-600">{progressPct}% complete</p>
            </div>
          </div>
          <Progress value={progressPct} className="h-2.5 bg-amber-100/80 [&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-orange-500" />
          {bigWheelEveryStamps > 0 ? (
            <p className="text-xs text-amber-900/80">
              <span className="font-semibold">{stampsToNextBig} stamp{stampsToNextBig === 1 ? "" : "s"}</span>{" "}
              until your next Big Wheel entry
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "flex items-stretch gap-1 rounded-xl border border-amber-200/60 bg-white/70 p-2 md:gap-2 md:p-2.5",
          embedded && "border-slate-200/80 bg-[#F7F8FA]",
        )}
      >
        <RewardNode
          icon={<Stamp className="h-4 w-4 text-amber-700" />}
          iconBg="bg-amber-100"
          label="Stamps"
          value={String(approvedStamps)}
          highlight
        />
        <div className="flex shrink-0 items-center px-0.5 text-amber-500/80">
          <ArrowRight className="h-4 w-4" aria-hidden />
        </div>
        <RewardNode
          icon={<Ticket className="h-4 w-4 text-orange-600" />}
          iconBg="bg-orange-100"
          label="Little"
          value={String(littleWheelEntries)}
        />
        <div className="flex shrink-0 items-center px-0.5 text-amber-500/80">
          <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden />
        </div>
        <RewardNode
          icon={<Trophy className="h-4 w-4 text-amber-600" />}
          iconBg="bg-amber-100"
          label="Big"
          value={String(bigWheelEntries)}
        />
      </div>

      {!embedded && !compact ? (
        <div className="mt-2.5 hidden rounded-lg border border-slate-200/60 bg-white/60 px-3 py-2 md:block">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-600">Next Big Wheel entry</span>
            <span className="font-bold tabular-nums text-slate-900">
              {nextBig.current} / {nextBig.target} stamps
            </span>
          </div>
          <Progress value={nextBigPct} className="mt-1.5 h-1.5 bg-slate-200" />
        </div>
      ) : null}

      {embedded || compact ? null : (
        <div className="-mx-0.5 mt-2.5 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          <MobileChip label="Little entries" value={String(littleWheelEntries)} />
          <MobileChip label="Big entries" value={String(bigWheelEntries)} />
          <MobileChip
            label="Next Big"
            value={`${nextBig.current}/${nextBig.target}`}
            wide
          />
        </div>
      )}
    </section>
  );
}

function RewardNode({
  icon,
  iconBg,
  label,
  value,
  highlight,
}: {
  icon: ReactNode;
  iconBg: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-1 py-1.5 text-center sm:px-2",
        highlight && "bg-amber-50/80",
      )}
    >
      <div className={cn("mb-1 flex h-8 w-8 items-center justify-center rounded-full", iconBg)}>
        {icon}
      </div>
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-black tabular-nums leading-tight text-slate-900 sm:text-xl">{value}</p>
    </div>
  );
}

function MobileChip({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 snap-start flex-col rounded-full border border-amber-200/70 bg-white/90 px-3 py-1.5",
        wide ? "min-w-[100px]" : "min-w-[88px]",
      )}
    >
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-black tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
