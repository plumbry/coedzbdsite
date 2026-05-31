import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";

export type LegendItem = {
  label: React.ReactNode;
  description?: React.ReactNode;
};

export type LegendGroup = {
  title?: string;
  items: LegendItem[];
};

type LegendCardProps = {
  title: string;
  groups: LegendGroup[];
  className?: string;
};

export default function LegendCard({ title, groups, className }: LegendCardProps) {
  return (
    <Card className={cn("mb-4", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {group.title && (
              <span className="font-semibold text-muted-foreground">{group.title}</span>
            )}
            {group.items.map((item, itemIndex) => (
              <div key={itemIndex} className="flex items-center gap-1.5">
                {item.label}
                {item.description && (
                  <span className="text-muted-foreground">{item.description}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
