import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import type { SealBadgeStatus } from "./passport-seal.ts";

type BadgeConfig = {
  label: string;
  tooltip: string;
  icon: LucideIcon;
  className: string;
  dot: string;
};

/**
 * Single source of truth for status presentation across the passport. Every
 * badge pairs a colour with an icon and text label so colour is never the only
 * signal (accessibility requirement).
 */
export const SEAL_BADGE_CONFIG: Record<SealBadgeStatus, BadgeConfig> = {
  earned: {
    label: "Earned",
    tooltip: "Completed and approved.",
    icon: CheckCircle2,
    className: "bg-teal-50 text-teal-800 border-teal-200",
    dot: "bg-teal-500",
  },
  pending: {
    label: "Pending Review",
    tooltip: "Evidence submitted and awaiting review.",
    icon: Clock,
    className: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  needs_changes: {
    label: "Needs Changes",
    tooltip: "Additional or clearer evidence is required.",
    icon: AlertTriangle,
    className: "bg-orange-50 text-orange-800 border-orange-200",
    dot: "bg-orange-500",
  },
  in_progress: {
    label: "In Progress",
    tooltip: "Keep completing challenges in this category to earn the seal.",
    icon: Loader2,
    className: "bg-sky-50 text-sky-800 border-sky-200",
    dot: "bg-sky-500",
  },
  locked: {
    label: "Locked",
    tooltip: "View the challenge requirements to begin progress.",
    icon: Lock,
    className: "bg-stone-100 text-stone-600 border-stone-200",
    dot: "bg-stone-400",
  },
};

export function PassportStatusBadge({
  status,
  size = "sm",
  withTooltip = true,
  className,
}: {
  status: SealBadgeStatus;
  size?: "sm" | "md";
  withTooltip?: boolean;
  className?: string;
}) {
  const config = SEAL_BADGE_CONFIG[status];
  const Icon = config.icon;

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        config.className,
        className,
      )}
    >
      <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden />
      {config.label}
    </span>
  );

  if (!withTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-help focus-visible:outline-none">
          {badge}
          <span className="sr-only">: {config.tooltip}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{config.tooltip}</TooltipContent>
    </Tooltip>
  );
}
