import { Link } from "react-router-dom";
import { cn } from "@/lib/utils.ts";

type SiteWordmarkProps = {
  className?: string;
  /** Hide the “Hub” line — used in the compact header. */
  compact?: boolean;
  onClick?: () => void;
};

export default function SiteWordmark({ className, compact = false, onClick }: SiteWordmarkProps) {
  return (
    <Link
      to="/"
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md text-foreground outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className,
      )}
      aria-label="Co-Ed ZBD Hub home"
    >
      <img
        src="/icon/co-ed-zbd-logo.jpg"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-full"
      />
      <span className="min-w-0 leading-none">
        <span className="block truncate text-sm font-bold tracking-tight sm:text-base">
          Co-Ed ZBD
        </span>
        {!compact && (
          <span className="mt-0.5 block text-xs text-muted-foreground">Hub</span>
        )}
      </span>
    </Link>
  );
}
