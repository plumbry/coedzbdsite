import { Check, Compass } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { getDestination } from "./passport-destinations.ts";
import { ssCard, ssCardPad, ssSectionTitle } from "./passport-dashboard-theme.ts";
import type { SealProgress } from "./passport-seal.ts";
import type { QuestCategory } from "./passport-types.ts";

function RouteNode({
  seal,
  index,
  isCurrent,
  isLast,
}: {
  seal: SealProgress;
  index: number;
  isCurrent: boolean;
  isLast: boolean;
}) {
  const dest = getDestination(seal.id);
  const earned = seal.state === "earned";

  return (
    <li className="relative flex min-w-[3.5rem] flex-1 flex-col items-center sm:min-w-0">
      {!isLast ? (
        <span
          className="absolute left-[calc(50%+14px)] top-3 hidden h-px w-[calc(100%-28px)] sm:block"
          aria-hidden
        >
          <span
            className={cn(
              "block h-full w-full",
              earned ? "bg-teal-400" : "bg-orange-200/80",
            )}
          />
        </span>
      ) : null}

      <div
        className={cn(
          "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold",
          earned && "border-teal-500 bg-teal-500 text-white",
          isCurrent && !earned && "border-orange-500 bg-orange-500 text-white",
          !earned && !isCurrent && "border-orange-200 bg-white text-orange-300",
        )}
      >
        {earned ? (
          <Check className="h-3 w-3" strokeWidth={3} />
        ) : isCurrent ? (
          <Compass className="h-3 w-3" />
        ) : (
          index + 1
        )}
      </div>
      <p
        className={cn(
          "mt-1 max-w-[4rem] truncate text-center text-[9px] font-semibold leading-tight",
          earned && "text-teal-800",
          isCurrent && !earned && "text-orange-700",
          !earned && !isCurrent && "text-orange-400",
        )}
      >
        {dest.name.split(" ")[0]}
      </p>
    </li>
  );
}

export function PassportJourneyRoute({
  seals,
  nextSealId,
  className,
}: {
  seals: SealProgress[];
  nextSealId: QuestCategory | null;
  className?: string;
}) {
  return (
    <section className={cn(ssCard, ssCardPad, className)} aria-label="Season route">
      <h2 className={cn(ssSectionTitle, "mb-2")}>Route</h2>
      <ol className="flex items-start justify-between gap-0.5 overflow-x-auto pb-0.5">
        {seals.map((seal, index) => (
          <RouteNode
            key={seal.id}
            seal={seal}
            index={index}
            isCurrent={seal.id === nextSealId}
            isLast={index === seals.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}
