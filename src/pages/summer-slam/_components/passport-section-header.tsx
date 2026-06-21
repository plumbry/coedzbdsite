import { cn } from "@/lib/utils.ts";
import { ssSectionDesc, ssSectionTitle } from "./passport-dashboard-theme.ts";
import { InfoTooltip } from "./passport-info-tooltip.tsx";

export function PassportSectionHeader({
  title,
  description,
  info,
  layout = "row",
  className,
}: {
  title: string;
  description?: string;
  /** Optional explanatory tooltip rendered beside the title. */
  info?: string;
  layout?: "row" | "stack";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2",
        layout === "stack" ? "space-y-0.5" : "flex items-baseline justify-between gap-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <h2 className={cn(ssSectionTitle, layout === "stack" && "whitespace-nowrap")}>{title}</h2>
        {info ? <InfoTooltip label={`About ${title.toLowerCase()}`} text={info} /> : null}
      </div>
      {description ? (
        <p className={cn(ssSectionDesc, layout === "row" && "hidden sm:block")}>{description}</p>
      ) : null}
    </div>
  );
}
