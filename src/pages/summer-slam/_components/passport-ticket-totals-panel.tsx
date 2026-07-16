import { cn } from "@/lib/utils.ts";
import {
  ssAccentBarClass,
  ssCardPad,
  ssSectionTitle,
} from "./passport-dashboard-theme.ts";

const TICKET_RULES = [
  { quests: "1 Quest", reward: "1 Little Wheel Ticket", unlock: false },
  { quests: "5 Quests", reward: "1 Big Wheel Ticket", unlock: false },
  { quests: "all 5 Categories", reward: "the Bonus Quest", unlock: true },
] as const;

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
        <ul className="space-y-1.5 text-xs leading-snug text-orange-900/70 sm:text-sm">
          {TICKET_RULES.map((rule) => (
            <li key={rule.quests}>
              {rule.unlock ? (
                <>
                  Complete <span className="font-semibold text-orange-950">all 5 Categories</span> =
                  Unlock <span className="font-semibold text-orange-950">the Bonus Quest</span>
                </>
              ) : (
                <>
                  Complete <span className="font-semibold text-orange-950">{rule.quests}</span> =
                  Earn <span className="font-semibold text-orange-950">{rule.reward}</span>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="text-pretty text-[10px] leading-relaxed text-orange-800/45 sm:text-xs">
          Ticket totals are tracked on your passport.
          <br />
          Draw details are announced in Discord.
        </p>
      </div>
    </section>
  );
}
