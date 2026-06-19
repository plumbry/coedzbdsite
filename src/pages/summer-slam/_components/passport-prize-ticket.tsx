import { cn } from "@/lib/utils.ts";
import { computeNextBigEntry } from "./passport-types.ts";

function StampProgressDots({
  approved,
  total,
}: {
  approved: number;
  total: number;
}) {
  if (total <= 0) return null;

  return (
    <div className="flex flex-wrap gap-1" aria-hidden>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-2 w-2 rounded-full",
            index < approved ? "bg-current opacity-90" : "border border-current opacity-30",
          )}
        />
      ))}
    </div>
  );
}

export function PassportPrizeTicket({
  approvedStamps,
  totalStamps,
  littleWheelEntries,
  bigWheelEntries,
  bigWheelEveryStamps,
}: {
  approvedStamps: number;
  totalStamps: number;
  littleWheelEntries: number;
  bigWheelEntries: number;
  bigWheelEveryStamps: number;
}) {
  const nextBig = computeNextBigEntry(approvedStamps, bigWheelEveryStamps);
  const stampsToNextBig =
    nextBig.remaining === nextBig.target && approvedStamps > 0 && nextBig.current === 0
      ? nextBig.target
      : nextBig.remaining;
  const passportComplete = totalStamps > 0 && approvedStamps >= totalStamps;

  return (
    <div
      className="relative border-t-2 border-dashed border-slate-400/50 bg-[#FFFDF8] px-3 py-3 sm:px-4"
      aria-label="Prize entries ticket"
    >
      <div
        className="pointer-events-none absolute -top-1.5 left-3 right-3 flex justify-between gap-1"
        aria-hidden
      >
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="h-2 w-2 rounded-full bg-[#FDFBF7]" />
        ))}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5 text-slate-800">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] opacity-70">
            Prize ticket
          </p>
          <div className="text-current">
            <StampProgressDots approved={approvedStamps} total={totalStamps} />
          </div>
          <p className="text-sm font-bold leading-snug">
            {passportComplete
              ? "Passport complete — entries earned"
              : stampsToNextBig > 0 && bigWheelEveryStamps > 0
                ? `${stampsToNextBig} stamp${stampsToNextBig === 1 ? "" : "s"} until Big Wheel spin`
                : "Collect stamps to earn wheel entries"}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <TicketPunch label="Little" value={littleWheelEntries} />
          <TicketPunch label="Big" value={bigWheelEntries} highlight />
        </div>
      </div>
    </div>
  );
}

function TicketPunch({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative min-w-[72px] rounded-md border border-dashed border-slate-400/60 px-2 py-1.5 text-center",
        highlight && "border-slate-500/70",
      )}
    >
      <span
        className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[#FFFDF8] ring-1 ring-slate-300/80"
        aria-hidden
      />
      <span
        className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[#FFFDF8] ring-1 ring-slate-300/80"
        aria-hidden
      />
      <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-black tabular-nums leading-none text-slate-900">{value}</p>
    </div>
  );
}
