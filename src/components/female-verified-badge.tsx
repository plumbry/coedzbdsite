import { Badge } from "@/components/ui/badge.tsx";
import { Trophy } from "lucide-react";

type FemaleVerifiedBadgeProps = {
  className?: string;
  compact?: boolean;
};

export default function FemaleVerifiedBadge({
  className,
  compact = false,
}: FemaleVerifiedBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={className ?? (compact ? "text-[10px] px-1.5 py-0 gap-0.5" : "text-xs gap-1")}
      title="Verified on Mod Log Girl Role sheet"
    >
      <Trophy className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {compact ? "Verified" : "Girl Role"}
    </Badge>
  );
}
