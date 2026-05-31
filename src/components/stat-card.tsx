import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  variant?: "default" | "destructive" | "primary";
  className?: string;
}

const iconBg: Record<NonNullable<StatCardProps["variant"]>, string> = {
  default: "bg-muted text-muted-foreground",
  destructive: "bg-destructive/10 text-destructive",
  primary: "bg-primary/10 text-primary",
};

export default function StatCard({
  label,
  value,
  icon: Icon,
  variant = "default",
  className,
}: StatCardProps) {
  return (
    <Card className={cn("py-0", className)}>
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        {Icon && (
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9",
              iconBg[variant],
            )}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
