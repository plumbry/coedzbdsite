import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

export const TIER_BADGE_COLORS: Record<string, string> = {
  S: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  A: "bg-red-500/20 text-red-400 border-red-500/30",
  B: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  C: "bg-green-500/20 text-green-400 border-green-500/30",
  D: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

type TierBadgeProps = {
  tier: string | undefined;
  className?: string;
  /** Square badge for tier-restriction style layouts */
  variant?: "default" | "square";
};

export function TierBadge({ tier, className, variant = "default" }: TierBadgeProps) {
  if (!tier) {
    return (
      <Badge variant="outline" className={cn("text-muted-foreground", className)}>
        ?
      </Badge>
    );
  }

  if (variant === "square") {
    return (
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold",
          TIER_BADGE_COLORS[tier] ?? "bg-muted text-muted-foreground border-border",
          className,
        )}
      >
        {tier}
      </span>
    );
  }

  return (
    <Badge variant="outline" className={cn("font-bold", TIER_BADGE_COLORS[tier] || "", className)}>
      {tier}
    </Badge>
  );
}

export function TierDiffBadge({ diff, className }: { diff: number; className?: string }) {
  if (diff === 0) return null;

  const isUpset = diff > 0;
  const diffText = diff > 0 ? `+${diff}` : `${diff}`;

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-xs",
        isUpset
          ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {diffText}
    </Badge>
  );
}
