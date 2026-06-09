import type { Doc } from "@/convex/_generated/dataModel.d.ts";

export type CalendarEntry = Doc<"potentialEventCalendarEntries">;
export type CalendarEntryStatus = NonNullable<CalendarEntry["status"]>;

export const CALENDAR_ENTRY_STATUS_LABELS: Record<CalendarEntryStatus, string> = {
  tentative: "Tentative",
  confirmed: "Confirmed",
  admin_note: "Admin Note",
  cancelled: "Cancelled",
};

export function normalizeEntryStatus(
  status: CalendarEntry["status"] | undefined,
): CalendarEntryStatus {
  return status ?? "tentative";
}

export function entryStatusLabel(status: CalendarEntry["status"] | undefined): string {
  return CALENDAR_ENTRY_STATUS_LABELS[normalizeEntryStatus(status)];
}

export function entryDotClass(entry: CalendarEntry): string {
  switch (entry.status) {
    case "cancelled":
      return "bg-destructive";
    case "admin_note":
      return "bg-amber-500";
    case "confirmed":
      return "bg-primary";
    default:
      return "bg-muted-foreground";
  }
}

export function entryChipClass(entry: CalendarEntry): string {
  switch (entry.status) {
    case "cancelled":
      return "bg-destructive/10 text-destructive line-through hover:bg-destructive/15";
    case "admin_note":
      return "bg-amber-500/15 text-amber-900 hover:bg-amber-500/25 dark:text-amber-100";
    case "confirmed":
      return "bg-primary/15 text-primary hover:bg-primary/25";
    default:
      return "bg-muted text-foreground hover:bg-muted/80";
  }
}

export function statusBadgeVariant(
  status: CalendarEntry["status"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "confirmed":
      return "default";
    case "cancelled":
      return "destructive";
    case "admin_note":
      return "outline";
    default:
      return "secondary";
  }
}
