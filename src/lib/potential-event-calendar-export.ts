import Papa from "papaparse";
import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from "date-fns";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

type CalendarEntry = Doc<"potentialEventCalendarEntries">;

const MAX_EXPORT_DAYS = 180;

function entryEndDate(entry: CalendarEntry): string {
  return entry.endDate ?? entry.date;
}

function entryOnDate(entry: CalendarEntry, dayKey: string): boolean {
  return entry.date <= dayKey && entryEndDate(entry) >= dayKey;
}

export function validateExportDateRange(rangeStart: string, rangeEnd: string): string | null {
  if (!rangeStart || !rangeEnd) {
    return "Start and end dates are required";
  }
  if (rangeEnd < rangeStart) {
    return "End date cannot be before start date";
  }
  const days = differenceInCalendarDays(parseISO(rangeEnd), parseISO(rangeStart)) + 1;
  if (days > MAX_EXPORT_DAYS) {
    return `Date range cannot exceed ${MAX_EXPORT_DAYS} days`;
  }
  return null;
}

export function buildCalendarExportRows(
  entries: CalendarEntry[],
  rangeStart: string,
  rangeEnd: string,
): Record<string, string>[] {
  const days = eachDayOfInterval({
    start: parseISO(rangeStart),
    end: parseISO(rangeEnd),
  });

  const rows: Record<string, string>[] = [];

  for (const day of days) {
    const dayKey = format(day, "yyyy-MM-dd");
    const dayEntries = entries
      .filter((entry) => entryOnDate(entry, dayKey))
      .sort((a, b) => a.title.localeCompare(b.title));

    if (dayEntries.length === 0) {
      rows.push({
        Date: dayKey,
        Weekday: format(day, "EEEE"),
        Title: "",
        Time: "",
        "Event start": "",
        "Event end": "",
        Status: "",
        Notes: "",
        "Added by": "",
      });
      continue;
    }

    for (const entry of dayEntries) {
      rows.push({
        Date: dayKey,
        Weekday: format(day, "EEEE"),
        Title: entry.title,
        Time: entry.time ?? "",
        "Event start": entry.date,
        "Event end": entryEndDate(entry),
        Status: entry.status ?? "tentative",
        Notes: entry.description ?? "",
        "Added by": entry.createdBy ?? "",
      });
    }
  }

  return rows;
}

export function downloadCalendarCsv(
  entries: CalendarEntry[],
  rangeStart: string,
  rangeEnd: string,
): void {
  const rows = buildCalendarExportRows(entries, rangeStart, rangeEnd);
  const csv = Papa.unparse(rows, { quotes: true, header: true });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `potential-events-${rangeStart}-to-${rangeEnd}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
