import { cn } from "@/lib/utils.ts";
import { ssSectionDesc, ssSectionTitle } from "./passport-dashboard-theme.ts";
import { InfoTooltip } from "./passport-info-tooltip.tsx";

export function PassportSectionHeader({
  title,
  description,
  info,
  className,
}: {
  title: string;
  description?: string;
  /** Optional explanatory tooltip rendered beside the title. */
  info?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-baseline justify-between gap-2", className)}>
      <div className="flex items-center gap-1.5">
        <h2 className={ssSectionTitle}>{title}</h2>
        {info ? <InfoTooltip label={`About ${title.toLowerCase()}`} text={info} /> : null}
      </div>
      {description ? <p className={cn(ssSectionDesc, "hidden sm:block")}>{description}</p> : null}
    </div>
  );
}
