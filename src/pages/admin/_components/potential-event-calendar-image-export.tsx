import { forwardRef, useMemo } from "react";
import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils.ts";
import {
  buildEntriesByDay,
  formatExportRangeTitle,
} from "@/lib/potential-event-calendar-export.ts";
import { entryChipClass, type CalendarEntry } from "@/lib/potential-event-calendar-types.ts";
import CalendarStatusLegend from "./potential-event-calendar-status-legend.tsx";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MAX_EVENTS_PER_CELL = 3;

function toDateInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function formatGridEventLabel(entry: CalendarEntry): string {
  const timePrefix = entry.time ? `${entry.time} ` : "";
  return `${timePrefix}${entry.title}`;
}

interface PotentialEventCalendarImageExportProps {
  entries: CalendarEntry[];
  rangeStart: string;
  rangeEnd: string;
}

const PotentialEventCalendarImageExport = forwardRef<
  HTMLDivElement,
  PotentialEventCalendarImageExportProps
>(function PotentialEventCalendarImageExport({ entries, rangeStart, rangeEnd }, ref) {
  const periodStart = useMemo(() => startOfDay(parseISO(rangeStart)), [rangeStart]);
  const periodEnd = useMemo(() => startOfDay(parseISO(rangeEnd)), [rangeEnd]);

  const entriesByDay = useMemo(() => buildEntriesByDay(entries), [entries]);

  const gridDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(periodStart, { weekStartsOn: 0 }),
      end: endOfWeek(periodEnd, { weekStartsOn: 0 }),
    });
  }, [periodStart, periodEnd]);

  const isInPeriod = (day: Date) =>
    isWithinInterval(startOfDay(day), { start: periodStart, end: periodEnd });

  return (
    <div
      ref={ref}
      className="w-[1100px] bg-white p-6 text-gray-900"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Potential Events Calendar</h1>
          <p className="text-sm text-gray-600">{formatExportRangeTitle(rangeStart, rangeEnd)}</p>
        </div>
        <CalendarStatusLegend className="text-gray-500" />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="grid grid-cols-7 border-b bg-gray-50">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="border-r border-gray-200 px-2 py-2 text-center text-xs font-medium text-gray-600 last:border-r-0"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((day) => {
            const dayKey = toDateInputValue(day);
            const dayEntries = entriesByDay.get(dayKey) ?? [];
            const inPeriod = isInPeriod(day);
            const visibleEntries = dayEntries.slice(0, MAX_EVENTS_PER_CELL);
            const hiddenCount = dayEntries.length - visibleEntries.length;

            return (
              <div
                key={dayKey}
                className={cn(
                  "flex min-h-24 flex-col border-b border-r border-gray-200 p-1.5 last:border-r-0",
                  !inPeriod && "bg-gray-50",
                )}
              >
                <span
                  className={cn(
                    "mb-1 text-sm",
                    inPeriod ? "font-medium text-gray-900" : "text-gray-400",
                  )}
                >
                  {format(day, "d")}
                </span>
                <div className="flex flex-col gap-0.5">
                  {visibleEntries.map((entry) => (
                    <div
                      key={`${dayKey}-${entry._id}`}
                      className={cn(
                        "truncate rounded px-1 py-0.5 text-[11px] leading-tight",
                        entryChipClass(entry),
                      )}
                      title={formatGridEventLabel(entry)}
                    >
                      {formatGridEventLabel(entry)}
                    </div>
                  ))}
                  {hiddenCount > 0 && (
                    <div className="px-1 text-[11px] text-gray-500">+{hiddenCount} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default PotentialEventCalendarImageExport;
