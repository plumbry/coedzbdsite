import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { toast } from "sonner";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import PageHeader from "@/components/page-header.tsx";
import ConfirmDialog from "@/components/confirm-dialog.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import PotentialEventCalendarEntryDialog from "./potential-event-calendar-entry-dialog.tsx";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

type CalendarEntry = Doc<"potentialEventCalendarEntries">;

function toDateInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function entryEndDate(entry: CalendarEntry): string {
  return entry.endDate ?? entry.date;
}

function entryOnDate(entry: CalendarEntry, date: Date): boolean {
  const day = toDateInputValue(date);
  return entry.date <= day && entryEndDate(entry) >= day;
}

function statusBadgeVariant(
  status: CalendarEntry["status"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "confirmed":
      return "default";
    case "cancelled":
      return "destructive";
    default:
      return "secondary";
  }
}

function formatEntryDateRange(entry: CalendarEntry): string {
  if (entry.endDate && entry.endDate !== entry.date) {
    return `${entry.date} – ${entry.endDate}`;
  }
  return entry.date;
}

interface PotentialEventCalendarManagerProps {
  readOnly?: boolean;
  viewerToken?: string;
  onEndViewSession?: () => void;
}

export default function PotentialEventCalendarManager({
  readOnly = false,
  viewerToken,
  onEndViewSession,
}: PotentialEventCalendarManagerProps) {
  const { hasEventBanAccess } = useUserRole();
  const canEdit = !readOnly && hasEventBanAccess;

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEntry | null>(null);

  const rangeStart = toDateInputValue(
    startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
  );
  const rangeEnd = toDateInputValue(endOfWeek(endOfMonth(month), { weekStartsOn: 0 }));

  const queryArgs = {
    rangeStart,
    rangeEnd,
    ...(viewerToken ? { viewerToken } : {}),
  };

  const entries = useQuery(api.potentialEventCalendar.queries.listEntries, queryArgs);
  const deleteEntry = useMutation(api.potentialEventCalendar.mutations.deleteEntry);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    if (!entries) return map;

    for (const entry of entries) {
      const start = new Date(`${entry.date}T12:00:00`);
      const end = new Date(`${entryEndDate(entry)}T12:00:00`);
      for (let cursor = start; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const key = toDateInputValue(cursor);
        const list = map.get(key) ?? [];
        list.push(entry);
        map.set(key, list);
      }
    }
    return map;
  }, [entries]);

  const selectedDayEntries = useMemo(() => {
    if (!selectedDate || !entries) return [];
    return entries
      .filter((entry) => entryOnDate(entry, selectedDate))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [entries, selectedDate]);

  const upcomingEntries = useMemo(() => {
    if (!entries) return [];
    const today = toDateInputValue(new Date());
    return entries
      .filter((entry) => entryEndDate(entry) >= today && entry.status !== "cancelled")
      .slice(0, 8);
  }, [entries]);

  const openCreateDialog = () => {
    setEditingEntry(null);
    setDialogOpen(true);
  };

  const openEditDialog = (entry: CalendarEntry) => {
    setEditingEntry(entry);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEntry({ id: deleteTarget._id as Id<"potentialEventCalendarEntries"> });
      toast.success("Event removed");
      setDeleteTarget(null);
    } catch {
      toast.error("Could not remove event");
    }
  };

  if (entries === undefined) {
    return <Skeleton className="h-[32rem] w-full" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Event Calendar"
        description="Plan potential events on a shared calendar. These entries are separate from the main events system."
        variant="compact"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {readOnly && onEndViewSession && (
              <Button variant="outline" size="sm" onClick={onEndViewSession}>
                <Lock className="mr-2 h-4 w-4" />
                End view session
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add event
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-medium">
              {format(month, "MMMM yyyy")}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMonth((current) => subMonths(current, 1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const today = startOfMonth(new Date());
                  setMonth(today);
                  setSelectedDate(new Date());
                }}
              >
                Today
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMonth((current) => addMonths(current, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              month={month}
              onMonthChange={setMonth}
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="p-0"
              modifiers={{
                hasEvent: (date) => (entriesByDay.get(toDateInputValue(date))?.length ?? 0) > 0,
              }}
              components={{
                DayButton: ({ day, modifiers, ...props }) => {
                  const dayEntries = entriesByDay.get(toDateInputValue(day.date)) ?? [];
                  return (
                    <CalendarDayButton
                      day={day}
                      modifiers={modifiers}
                      {...props}
                      className={cn(
                        props.className,
                        dayEntries.length > 0 && "font-semibold",
                      )}
                    >
                      <span>{day.date.getDate()}</span>
                      {dayEntries.length > 0 && (
                        <span className="flex gap-0.5">
                          {dayEntries.slice(0, 3).map((entry) => (
                            <span
                              key={entry._id}
                              className={cn(
                                "size-1 rounded-full",
                                entry.status === "cancelled"
                                  ? "bg-destructive"
                                  : entry.status === "confirmed"
                                    ? "bg-primary"
                                    : "bg-muted-foreground",
                              )}
                            />
                          ))}
                        </span>
                      )}
                    </CalendarDayButton>
                  );
                },
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                {selectedDate
                  ? format(selectedDate, "EEEE, MMMM d, yyyy")
                  : "Select a day"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedDayEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No potential events on this day.
                  {canEdit && selectedDate && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="text-primary underline-offset-4 hover:underline"
                        onClick={openCreateDialog}
                      >
                        Add one
                      </button>
                      .
                    </>
                  )}
                </p>
              ) : (
                selectedDayEntries.map((entry) => (
                  <EntryCard
                    key={entry._id}
                    entry={entry}
                    canEdit={canEdit}
                    onEdit={() => openEditDialog(entry)}
                    onDelete={() => setDeleteTarget(entry)}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <CalendarDays className="h-4 w-4" />
                Upcoming
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming events this month.</p>
              ) : (
                upcomingEntries.map((entry) => (
                  <div
                    key={entry._id}
                    className="flex items-start justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{entry.title}</p>
                        <Badge variant={statusBadgeVariant(entry.status)}>
                          {entry.status ?? "tentative"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatEntryDateRange(entry)}
                        {entry.time ? ` · ${entry.time}` : ""}
                      </p>
                    </div>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => openEditDialog(entry)}
                        aria-label={`Edit ${entry.title}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <MonthlyCalendarGrid
        month={month}
        selectedDate={selectedDate}
        entriesByDay={entriesByDay}
        onSelectDate={setSelectedDate}
        onSelectEntry={openEditDialog}
        canEdit={canEdit}
      />

      <PotentialEventCalendarEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editingEntry}
        defaultDate={selectedDate}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove potential event?"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" will be permanently removed from the calendar.`
            : undefined
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MAX_EVENTS_PER_CELL = 4;

function formatGridEventLabel(entry: CalendarEntry): string {
  const timePrefix = entry.time ? `${entry.time} ` : "";
  return `${timePrefix}${entry.title}`;
}

function entryStatusClass(status: CalendarEntry["status"]): string {
  switch (status) {
    case "confirmed":
      return "bg-primary/15 text-primary hover:bg-primary/25";
    case "cancelled":
      return "bg-destructive/10 text-destructive line-through hover:bg-destructive/15";
    default:
      return "bg-muted text-foreground hover:bg-muted/80";
  }
}

function MonthlyCalendarGrid({
  month,
  selectedDate,
  entriesByDay,
  onSelectDate,
  onSelectEntry,
  canEdit,
}: {
  month: Date;
  selectedDate: Date | undefined;
  entriesByDay: Map<string, CalendarEntry[]>;
  onSelectDate: (date: Date) => void;
  onSelectEntry: (entry: CalendarEntry) => void;
  canEdit: boolean;
}) {
  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 0 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
    });
  }, [month]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Monthly calendar view</CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[44rem] border-t">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="border-r px-2 py-2 text-center text-xs font-medium text-muted-foreground last:border-r-0"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {gridDays.map((day) => {
                const dayKey = toDateInputValue(day);
                const dayEntries = entriesByDay.get(dayKey) ?? [];
                const inMonth = isSameMonth(day, month);
                const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                const visibleEntries = dayEntries.slice(0, MAX_EVENTS_PER_CELL);
                const hiddenCount = dayEntries.length - visibleEntries.length;

                return (
                  <div
                    key={dayKey}
                    className={cn(
                      "flex min-h-28 flex-col border-b border-r p-1.5 last:border-r-0",
                      !inMonth && "bg-muted/20",
                      isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDate(day)}
                      className={cn(
                        "mb-1 flex size-7 shrink-0 items-center justify-center self-start rounded-full text-sm",
                        isToday(day) && "bg-primary font-semibold text-primary-foreground",
                        !isToday(day) && inMonth && "font-medium",
                        !inMonth && "text-muted-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </button>
                    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                      {visibleEntries.map((entry) => (
                        <button
                          key={`${dayKey}-${entry._id}`}
                          type="button"
                          title={formatGridEventLabel(entry)}
                          onClick={() => {
                            onSelectDate(day);
                            if (canEdit) onSelectEntry(entry);
                          }}
                          className={cn(
                            "w-full truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight",
                            entryStatusClass(entry.status),
                            !canEdit && "cursor-default",
                          )}
                        >
                          {formatGridEventLabel(entry)}
                        </button>
                      ))}
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={() => onSelectDate(day)}
                          className="truncate px-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          +{hiddenCount} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EntryCard({
  entry,
  canEdit,
  onEdit,
  onDelete,
}: {
  entry: CalendarEntry;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{entry.title}</h3>
            <Badge variant={statusBadgeVariant(entry.status)}>
              {entry.status ?? "tentative"}
            </Badge>
            {entry.recurrenceSeriesId && (
              <Badge variant="outline">Recurring</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatEntryDateRange(entry)}
            {entry.time ? ` · ${entry.time}` : ""}
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )}
      </div>
      {entry.description && (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{entry.description}</p>
      )}
      {entry.createdBy && (
        <p className="text-xs text-muted-foreground">Added by {entry.createdBy}</p>
      )}
    </div>
  );
}
