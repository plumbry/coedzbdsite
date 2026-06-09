import { cn } from "@/lib/utils.ts";
import { entryLegendClass, type CalendarEntryStatus } from "@/lib/potential-event-calendar-types.ts";

const LEGEND_LABELS: Record<CalendarEntryStatus, string> = {
  tentative: "Tent",
  confirmed: "Conf",
  admin_note: "Admin",
  cancelled: "Cancel",
};

const LEGEND_STATUSES: CalendarEntryStatus[] = [
  "tentative",
  "confirmed",
  "admin_note",
  "cancelled",
];

interface CalendarStatusLegendProps {
  className?: string;
}

export default function CalendarStatusLegend({ className }: CalendarStatusLegendProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}
      aria-label="Event status legend"
    >
      {LEGEND_STATUSES.map((status) => (
        <span
          key={status}
          className="inline-flex items-center gap-1 text-[10px] leading-none text-muted-foreground"
        >
          <span className={cn("size-1.5 shrink-0 rounded-sm", entryLegendClass(status))} />
          {LEGEND_LABELS[status]}
        </span>
      ))}
    </div>
  );
}
