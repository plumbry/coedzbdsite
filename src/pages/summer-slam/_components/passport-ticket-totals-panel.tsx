import { cn } from "@/lib/utils.ts";
import {
  ssAccentBarClass,
  ssCardPad,
  ssSectionTitle,
} from "./passport-dashboard-theme.ts";

export function PassportTicketTotalsPanel({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "shrink-0 overflow-hidden rounded-xl border border-orange-200/60 bg-white/95 shadow-sm",
        className,
      )}
      aria-label="Ticket Totals"
    >
      <div className={ssAccentBarClass} />
      <div className={cn(ssCardPad, "space-y-2")}>
        <h2 className={cn(ssSectionTitle, "text-base")}>Ticket Totals</h2>
        <ul className="space-y-1 text-[11px] leading-snug text-orange-900/70">
          <li>
            Complete <span className="font-semibold text-orange-950">1 Quest</span> = Earn{" "}
            <span className="font-semibold text-orange-950">1 Little Prize Wheel Ticket</span>
          </li>
          <li>
            Complete <span className="font-semibold text-orange-950">5 Quests</span> = Earn{" "}
            <span className="font-semibold text-orange-950">5 Little Prize Wheel Tickets</span>
          </li>
          <li className="text-orange-800/45">
            Completed everything? Start your secret bonus quests
          </li>
        </ul>
        <p className="text-[10px] leading-relaxed text-orange-800/45">
          Draw dates and prize details are announced in Discord. Ticket totals are tracked on your
          passport.
        </p>
      </div>
    </section>
  );
}
