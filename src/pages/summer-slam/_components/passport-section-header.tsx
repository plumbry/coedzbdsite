import { cn } from "@/lib/utils.ts";
import { ssSectionDesc, ssSectionTitle } from "./passport-dashboard-theme.ts";

export function PassportSectionHeader({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-baseline justify-between gap-2", className)}>
      <h2 className={ssSectionTitle}>{title}</h2>
      {description ? <p className={cn(ssSectionDesc, "hidden sm:block")}>{description}</p> : null}
    </div>
  );
}
