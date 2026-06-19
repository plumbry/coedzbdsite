import { cn } from "@/lib/utils.ts";

/** Subtle decorative summer/travel motifs — low opacity, never blocks content. */
export function PassportAtmosphere({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      {/* Soft sun glow — top right */}
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-orange-300/25 via-amber-200/15 to-transparent blur-2xl" />

      {/* Ocean wash — bottom left */}
      <div className="absolute -bottom-20 -left-12 h-48 w-72 rounded-full bg-gradient-to-tr from-teal-400/15 via-cyan-300/10 to-transparent blur-2xl" />

      {/* Compass — top left */}
      <svg
        viewBox="0 0 64 64"
        className="absolute left-4 top-4 h-14 w-14 text-teal-600/10 sm:left-8 sm:top-6 sm:h-16 sm:w-16"
      >
        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="32" cy="32" r="4" fill="currentColor" />
        <path d="M32 8 L36 28 L32 32 L28 28 Z" fill="currentColor" opacity="0.7" />
        <path d="M32 56 L28 36 L32 32 L36 36 Z" fill="currentColor" opacity="0.35" />
        <path d="M8 32 L28 28 L32 32 L28 36 Z" fill="currentColor" opacity="0.35" />
        <path d="M56 32 L36 36 L32 32 L36 28 Z" fill="currentColor" opacity="0.35" />
      </svg>

      {/* Palm frond — bottom right */}
      <svg
        viewBox="0 0 80 80"
        className="absolute -bottom-2 -right-2 h-20 w-20 text-emerald-600/12 sm:h-24 sm:w-24"
      >
        <path
          d="M40 70 Q20 50 10 30 Q25 35 40 45 Q55 35 70 30 Q60 50 40 70"
          fill="currentColor"
        />
        <path
          d="M40 70 Q35 45 40 20 Q45 45 40 70"
          fill="currentColor"
          opacity="0.5"
        />
      </svg>

      {/* Postcard corner — top right */}
      <svg
        viewBox="0 0 48 48"
        className="absolute right-0 top-0 h-12 w-12 text-orange-400/20"
      >
        <path d="M48 0 L48 48 L0 48 Q48 48 48 0" fill="currentColor" />
      </svg>

      {/* Wave line — mid section */}
      <svg
        viewBox="0 0 400 24"
        preserveAspectRatio="none"
        className="absolute bottom-8 left-0 right-0 h-6 w-full text-teal-500/10"
      >
        <path
          d="M0 12 Q50 0 100 12 T200 12 T300 12 T400 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

/** Air-mail style dashed border accent for passport pages */
export function PassportPostmark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-14 w-14 rotate-[-12deg] items-center justify-center rounded-full border-2 border-dashed border-orange-400/40 text-orange-500/30",
        className,
      )}
      aria-hidden
    >
      <span className="text-[8px] font-bold uppercase tracking-widest">SS &apos;26</span>
    </div>
  );
}
