import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { toast } from "sonner";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import PageHeader from "@/components/page-header.tsx";
import ConfirmDialog from "@/components/confirm-dialog.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import PotentialEventCalendarEntryDialog from "./potential-event-calendar-entry-dialog.tsx";
import PotentialEventCalendarExportDialog from "./potential-event-calendar-export-dialog.tsx";
import CalendarStatusLegend from "./potential-event-calendar-status-legend.tsx";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  entryBadgeClass,
  entryChipClass,
  entryDotClass,
  entryStatusLabel,
  statusBadgeVariant,
} from "@/lib/potential-event-calendar-types.ts";

type CalendarEntry = Doc<"potentialEventCalendarEntries">;
type CalendarGridView = "month" | "ninety-day";

const NINETY_DAY_COUNT = 90;

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
  const [gridView, setGridView] = useState<CalendarGridView>("month");
  const [periodStart, setPeriodStart] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEntry | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const periodEnd = useMemo(
    () => addDays(periodStart, NINETY_DAY_COUNT - 1),
    [periodStart],
  );

  const { rangeStart, rangeEnd, exportRangeStart, exportRangeEnd, gridPeriodStart, gridPeriodEnd } =
    useMemo(() => {
      if (gridView === "month") {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        return {
          rangeStart: toDateInputValue(startOfWeek(monthStart, { weekStartsOn: 0 })),
          rangeEnd: toDateInputValue(endOfWeek(monthEnd, { weekStartsOn: 0 })),
          exportRangeStart: toDateInputValue(monthStart),
          exportRangeEnd: toDateInputValue(monthEnd),
          gridPeriodStart: monthStart,
          gridPeriodEnd: monthEnd,
        };
      }

      return {
        rangeStart: toDateInputValue(startOfWeek(periodStart, { weekStartsOn: 0 })),
        rangeEnd: toDateInputValue(endOfWeek(periodEnd, { weekStartsOn: 0 })),
        exportRangeStart: toDateInputValue(periodStart),
        exportRangeEnd: toDateInputValue(periodEnd),
        gridPeriodStart: periodStart,
        gridPeriodEnd: periodEnd,
      };
    }, [gridView, month, periodStart, periodEnd]);

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

  const { upcomingEntries, upcomingTotal } = useMemo(() => {
    if (!entries) return { upcomingEntries: [], upcomingTotal: 0 };
    const today = toDateInputValue(new Date());
    const upcoming = entries
      .filter((entry) => entryEndDate(entry) >= today && entry.status !== "cancelled")
      .sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.title.localeCompare(b.title);
      });
    return {
      upcomingEntries: upcoming.slice(0, 3),
      upcomingTotal: upcoming.length,
    };
  }, [entries]);

  const openCreateDialog = () => {
    setEditingEntry(null);
    setDialogOpen(true);
  };

  const ensureDateInNinetyDayWindow = (date: Date) => {
    if (
      !isWithinInterval(startOfDay(date), {
        start: periodStart,
        end: periodEnd,
      })
    ) {
      setPeriodStart(startOfDay(date));
    }
  };

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    if (!isSameMonth(date, month)) {
      setMonth(startOfMonth(date));
    }
    if (gridView === "ninety-day") {
      ensureDateInNinetyDayWindow(date);
    }
  };

  const handleDateSelect = (date: Date) => {
    selectDate(date);
    if (canEdit) {
      openCreateDialog();
    }
  };

  const openEditDialog = (entry: CalendarEntry) => {
    setEditingEntry(entry);
    setDialogOpen(true);
  };

  const handleGridViewChange = (view: CalendarGridView) => {
    const anchor = startOfDay(selectedDate ?? new Date());
    if (view === "ninety-day") {
      setPeriodStart(anchor);
    } else {
      setMonth(startOfMonth(anchor));
    }
    setGridView(view);
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
    <div className="space-y-3 md:space-y-6">
      <PageHeader
        title="Event Calendar"
        description="Plan potential events on a shared calendar. These entries are separate from the main events system."
        variant="compact"
        className="space-y-2"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {readOnly && onEndViewSession && (
              <Button variant="outline" size="sm" onClick={onEndViewSession}>
                <Lock className="mr-2 h-4 w-4" />
                End view session
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => openCreateDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add event
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-6">
        <Card className="mx-auto w-full max-w-sm gap-0 py-0 lg:max-w-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-3 py-2 lg:px-4">
            <CardTitle className="text-sm font-medium lg:text-base">
              {format(month, "MMMM yyyy")}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 lg:h-8 lg:w-8"
                onClick={() => setMonth((current) => subMonths(current, 1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 lg:h-8"
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
                className="h-7 w-7 lg:h-8 lg:w-8"
                onClick={() => setMonth((current) => addMonths(current, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex justify-center px-2 py-2 lg:px-4 lg:py-3">
            <Calendar
              mode="single"
              month={month}
              onMonthChange={setMonth}
              selected={selectedDate}
              onSelect={(date) => date && handleDateSelect(date)}
              className="p-0 [--cell-size:--spacing(7)] lg:[--cell-size:--spacing(8)]"
              modifiers={{
                hasEvent: (date) => (entriesByDay.get(toDateInputValue(date))?.length ?? 0) > 0,
              }}
              classNames={{
                nav: "hidden",
                month: "gap-2",
                month_caption: "hidden",
                week: "mt-1",
                weekday: "text-[0.7rem] lg:text-[0.8rem]",
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
                        "gap-0.5 text-xs",
                        dayEntries.length > 0 && "font-semibold",
                      )}
                    >
                      <span>{day.date.getDate()}</span>
                      {dayEntries.length > 0 && (
                        <span className="flex gap-0.5">
                          {dayEntries.slice(0, 3).map((entry) => (
                            <span
                              key={entry._id}
                              className={cn("size-1 rounded-full", entryDotClass(entry))}
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

        <div className="space-y-3 lg:space-y-6">
          <Card className="gap-0 py-0">
            <CardHeader className="px-3 py-3 lg:px-4">
              <CardTitle className="text-sm font-medium lg:text-base">
                {selectedDate
                  ? format(selectedDate, "EEEE, MMMM d, yyyy")
                  : "Select a day"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-3 pb-3 lg:px-4">
              {selectedDayEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No potential events on this day.
                  {canEdit && selectedDate && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="text-primary underline-offset-4 hover:underline"
                        onClick={() => openCreateDialog()}
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

          <Card className="gap-0 py-0">
            <CardHeader className="px-3 py-3 lg:px-4">
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  Upcoming
                </span>
                {upcomingTotal > 3 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    next 3 of {upcomingTotal}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 lg:px-4">
              {upcomingEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No upcoming events.</p>
              ) : (
                <ul className="divide-y">
                  {upcomingEntries.map((entry) => (
                    <li
                      key={entry._id}
                      className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0"
                    >
                      <span
                        className={cn("size-1.5 shrink-0 rounded-full", entryDotClass(entry))}
                        title={entryStatusLabel(entry.status)}
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                        onClick={() => {
                          setSelectedDate(new Date(`${entry.date}T12:00:00`));
                          setMonth(startOfMonth(new Date(`${entry.date}T12:00:00`)));
                        }}
                      >
                        <span className="tabular-nums text-muted-foreground">
                          {format(new Date(`${entry.date}T12:00:00`), "MMM d")}
                          {entry.time ? ` ${entry.time}` : ""}
                        </span>
                        <span className="mx-1 text-muted-foreground">·</span>
                        <span>{entry.title}</span>
                      </button>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => openEditDialog(entry)}
                          aria-label={`Edit ${entry.title}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="hidden lg:block">
        <PeriodCalendarGrid
        gridView={gridView}
        onGridViewChange={handleGridViewChange}
        periodStart={gridPeriodStart}
        periodEnd={gridPeriodEnd}
        selectedDate={selectedDate}
        entriesByDay={entriesByDay}
        onDayClick={handleDateSelect}
        onSelectDate={selectDate}
        onSelectEntry={openEditDialog}
        onPreviousPeriod={() => {
          if (gridView === "month") {
            setMonth((current) => subMonths(current, 1));
            return;
          }
          setPeriodStart((current) => subDays(current, NINETY_DAY_COUNT));
        }}
        onNextPeriod={() => {
          if (gridView === "month") {
            setMonth((current) => addMonths(current, 1));
            return;
          }
          setPeriodStart((current) => addDays(current, NINETY_DAY_COUNT));
        }}
        onGoToToday={() => {
          const today = startOfDay(new Date());
          setSelectedDate(today);
          setMonth(startOfMonth(today));
          setPeriodStart(today);
        }}
        canEdit={canEdit}
        />
      </div>

      <PotentialEventCalendarEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editingEntry}
        defaultDate={selectedDate}
      />

      <PotentialEventCalendarExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultRangeStart={exportRangeStart}
        defaultRangeEnd={exportRangeEnd}
        viewerToken={viewerToken}
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
const MAX_EVENTS_PER_MONTH_CELL = 4;
const MAX_EVENTS_PER_NINETY_DAY_CELL = 2;

function formatGridEventLabel(entry: CalendarEntry): string {
  const timePrefix = entry.time ? `${entry.time} ` : "";
  return `${timePrefix}${entry.title}`;
}

function PeriodCalendarGrid({
  gridView,
  onGridViewChange,
  periodStart,
  periodEnd,
  selectedDate,
  entriesByDay,
  onDayClick,
  onSelectDate,
  onSelectEntry,
  onPreviousPeriod,
  onNextPeriod,
  onGoToToday,
  canEdit,
}: {
  gridView: CalendarGridView;
  onGridViewChange: (view: CalendarGridView) => void;
  periodStart: Date;
  periodEnd: Date;
  selectedDate: Date | undefined;
  entriesByDay: Map<string, CalendarEntry[]>;
  onDayClick: (date: Date) => void;
  onSelectDate: (date: Date) => void;
  onSelectEntry: (entry: CalendarEntry) => void;
  onPreviousPeriod: () => void;
  onNextPeriod: () => void;
  onGoToToday: () => void;
  canEdit: boolean;
}) {
  const isNinetyDayView = gridView === "ninety-day";
  const maxEventsPerCell = isNinetyDayView
    ? MAX_EVENTS_PER_NINETY_DAY_CELL
    : MAX_EVENTS_PER_MONTH_CELL;
  const cellMinHeight = isNinetyDayView ? "min-h-20" : "min-h-28";

  const gridDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(periodStart, { weekStartsOn: 0 }),
      end: endOfWeek(periodEnd, { weekStartsOn: 0 }),
    });
  }, [periodStart, periodEnd]);

  const periodTitle =
    gridView === "month"
      ? format(periodStart, "MMMM yyyy")
      : `${format(periodStart, "MMM d, yyyy")} – ${format(periodEnd, "MMM d, yyyy")}`;

  const isInPeriod = (day: Date) =>
    isWithinInterval(startOfDay(day), { start: periodStart, end: periodEnd });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base font-medium">{periodTitle}</CardTitle>
          <CalendarStatusLegend />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={gridView}
            onValueChange={(value) => onGridViewChange(value as CalendarGridView)}
          >
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="ninety-day">90 days</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onPreviousPeriod}
              aria-label={isNinetyDayView ? "Previous 90 days" : "Previous month"}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onGoToToday}>
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onNextPeriod}
              aria-label={isNinetyDayView ? "Next 90 days" : "Next month"}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
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
                const inPeriod = isInPeriod(day);
                const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                const visibleEntries = dayEntries.slice(0, maxEventsPerCell);
                const hiddenCount = dayEntries.length - visibleEntries.length;
                const showMonthLabel = isNinetyDayView && inPeriod && day.getDate() === 1;

                return (
                  <div
                    key={dayKey}
                    role={canEdit && inPeriod ? "button" : undefined}
                    tabIndex={canEdit && inPeriod ? 0 : undefined}
                    title={canEdit && inPeriod ? "Add event on this day" : undefined}
                    onClick={() => inPeriod && onDayClick(day)}
                    onKeyDown={(e) => {
                      if (canEdit && inPeriod && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onDayClick(day);
                      }
                    }}
                    className={cn(
                      "flex flex-col border-b border-r p-1.5 last:border-r-0",
                      cellMinHeight,
                      !inPeriod && "bg-muted/20",
                      isSelected && inPeriod && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                      canEdit && inPeriod && "cursor-pointer hover:bg-muted/30",
                    )}
                  >
                    <div className="mb-1 flex flex-col self-start">
                      {showMonthLabel && (
                        <span className="mb-0.5 text-[10px] font-semibold leading-none text-muted-foreground">
                          {format(day, "MMMM")}
                        </span>
                      )}
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full text-sm",
                          isToday(day) && inPeriod && "bg-primary font-semibold text-primary-foreground",
                          !isToday(day) && inPeriod && "font-medium",
                          !inPeriod && "text-muted-foreground",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                      {visibleEntries.map((entry) => (
                        <button
                          key={`${dayKey}-${entry._id}`}
                          type="button"
                          title={formatGridEventLabel(entry)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDate(day);
                            if (canEdit) onSelectEntry(entry);
                          }}
                          className={cn(
                            "w-full truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight",
                            entryChipClass(entry),
                            !canEdit && "cursor-default",
                          )}
                        >
                          {formatGridEventLabel(entry)}
                        </button>
                      ))}
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDayClick(day);
                          }}
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
    <div className="space-y-2 rounded-md border p-3 lg:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 lg:gap-2">
            <h3 className="font-medium leading-tight">{entry.title}</h3>
            <Badge variant={statusBadgeVariant(entry.status)} className={entryBadgeClass(entry)}>
              {entryStatusLabel(entry.status)}
            </Badge>
            {entry.recurrenceSeriesId && (
              <Badge variant="outline">Recurring</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground lg:text-sm">
            {formatEntryDateRange(entry)}
            {entry.time ? ` · ${entry.time}` : ""}
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete}>
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
