import { Compass, Plane } from "lucide-react";
import { cn } from "@/lib/utils.ts";

/**
 * Welcoming travel-document hero for the top of the passport dashboard.
 * Light, summery and decorative without dominating the page.
 */
export function PassportHero({
  title,
  seasonLabel,
  statusLabel,
  className,
}: {
  title: string;
  seasonLabel: string;
  statusLabel?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-br from-sky-100 via-cyan-50 to-orange-50 px-5 py-6 shadow-[0_8px_30px_-12px_rgba(14,165,233,0.35)] sm:px-8 sm:py-8",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 20%, rgba(14,165,233,0.4) 0, transparent 42%), radial-gradient(circle at 85% 15%, rgba(249,115,22,0.35) 0, transparent 40%)",
        }}
      />
      <svg
        aria-hidden
        className="pointer-events-none absolute -right-6 top-2 hidden h-24 w-64 text-sky-300/60 sm:block"
        viewBox="0 0 240 80"
        fill="none"
      >
        <path
          d="M4 60 C 60 10, 120 70, 236 18"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="2 10"
        />
      </svg>

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.3em] text-sky-700/80">
            <Plane className="h-3.5 w-3.5" aria-hidden />
            Summer Slam
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            {title}
          </h1>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-600/90">
            {seasonLabel}
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 backdrop-blur-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm">
            <Compass className="h-5 w-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              The journey awaits
            </p>
            <p className="text-sm font-bold text-slate-800">
              {statusLabel ?? "Collect all five seals"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
