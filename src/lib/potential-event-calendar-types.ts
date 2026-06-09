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

export function entryLegendClass(status: CalendarEntryStatus): string {
  switch (status) {
    case "cancelled":
      return "bg-red-500";
    case "admin_note":
      return "bg-purple-600";
    case "confirmed":
      return "bg-green-500";
    default:
      return "bg-orange-500";
  }
}

export function entryDotClass(entry: CalendarEntry): string {
  return entryLegendClass(normalizeEntryStatus(entry.status));
}

export function entryChipClass(entry: CalendarEntry): string {
  switch (entry.status) {
    case "cancelled":
      return "bg-red-400 text-black line-through hover:bg-red-500";
    case "admin_note":
      return "bg-purple-600 text-white hover:bg-purple-700";
    case "confirmed":
      return "bg-green-400 text-black hover:bg-green-500";
    default:
      return "bg-orange-500 text-white hover:bg-orange-600";
  }
}

export function entryBadgeClass(entry: CalendarEntry): string {
  switch (entry.status) {
    case "cancelled":
      return "border-red-500 bg-red-400 text-black line-through";
    case "admin_note":
      return "border-purple-600 bg-purple-600 text-white";
    case "confirmed":
      return "border-green-500 bg-green-400 text-black";
    default:
      return "border-orange-500 bg-orange-500 text-white";
  }
}

export function statusBadgeVariant(
  status: CalendarEntry["status"],
): "default" | "secondary" | "destructive" | "outline" {
  return "outline";
}
