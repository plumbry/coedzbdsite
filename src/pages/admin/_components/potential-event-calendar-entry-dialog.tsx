import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";

type CalendarEntry = Doc<"potentialEventCalendarEntries">;
type EntryStatus = NonNullable<CalendarEntry["status"]>;
type RecurrenceInterval = "daily" | "weekly" | "monthly";

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface PotentialEventCalendarEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: CalendarEntry | null;
  defaultDate?: Date;
}

export default function PotentialEventCalendarEntryDialog({
  open,
  onOpenChange,
  entry,
  defaultDate,
}: PotentialEventCalendarEntryDialogProps) {
  const createEntry = useMutation(api.potentialEventCalendar.mutations.createEntry);
  const updateEntry = useMutation(api.potentialEventCalendar.mutations.updateEntry);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [time, setTime] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<EntryStatus>("tentative");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>("weekly");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = Boolean(entry);

  useEffect(() => {
    if (!open) return;

    if (entry) {
      setTitle(entry.title);
      setDate(entry.date);
      setEndDate(entry.endDate ?? "");
      setTime(entry.time ?? "");
      setDescription(entry.description ?? "");
      setStatus(entry.status ?? "tentative");
      return;
    }

    setTitle("");
    setDate(defaultDate ? toDateInputValue(defaultDate) : toDateInputValue(new Date()));
    setEndDate("");
    setTime("");
    setDescription("");
    setStatus("tentative");
    setIsRecurring(false);
    setRecurrenceInterval("weekly");
    setRecurrenceUntil("");
  }, [open, entry, defaultDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      title,
      date,
      endDate: endDate.trim() || undefined,
      time: time.trim() || undefined,
      description: description.trim() || undefined,
      status,
    };

    if (isRecurring && !isEditing) {
      if (!recurrenceUntil.trim()) {
        toast.error("Choose a date for recurrence to end");
        setIsSubmitting(false);
        return;
      }
      if (recurrenceUntil < date) {
        toast.error("Recurrence end date cannot be before the start date");
        setIsSubmitting(false);
        return;
      }
    }

    try {
      if (entry) {
        await updateEntry({ id: entry._id as Id<"potentialEventCalendarEntries">, ...payload });
        toast.success("Event updated");
      } else {
        const result = await createEntry({
          ...payload,
          recurrence:
            isRecurring && recurrenceUntil.trim()
              ? { interval: recurrenceInterval, until: recurrenceUntil }
              : undefined,
        });
        toast.success(
          result.createdCount > 1
            ? `Added ${result.createdCount} recurring events`
            : "Event added",
        );
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string };
        toast.error(data.message ?? "Could not save event");
      } else {
        toast.error("Could not save event");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit potential event" : "Add potential event"}</DialogTitle>
            <DialogDescription>
              Planning entries are separate from the main events system.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="calendar-entry-title">Title</Label>
              <Input
                id="calendar-entry-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Community scrim night"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="calendar-entry-date">Start date</Label>
                <Input
                  id="calendar-entry-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calendar-entry-end-date">Event end date (optional)</Label>
                <Input
                  id="calendar-entry-end-date"
                  type="date"
                  value={endDate}
                  min={date || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  For multi-day events. Each recurrence uses the same length.
                </p>
              </div>
            </div>
            {!isEditing && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="calendar-entry-recurring"
                    checked={isRecurring}
                    onCheckedChange={(checked) => setIsRecurring(checked === true)}
                  />
                  <Label htmlFor="calendar-entry-recurring" className="font-normal">
                    Recurring event
                  </Label>
                </div>
                {isRecurring && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Repeats</Label>
                      <Select
                        value={recurrenceInterval}
                        onValueChange={(value) =>
                          setRecurrenceInterval(value as RecurrenceInterval)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="calendar-entry-recurrence-until">Repeat until</Label>
                      <Input
                        id="calendar-entry-recurrence-until"
                        type="date"
                        value={recurrenceUntil}
                        min={date || undefined}
                        onChange={(e) => setRecurrenceUntil(e.target.value)}
                        required={isRecurring}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {isEditing && entry?.recurrenceSeriesId && (
              <p className="text-xs text-muted-foreground">
                Part of a recurring series. Edits apply to this date only.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="calendar-entry-time">Time (optional)</Label>
                <Input
                  id="calendar-entry-time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="e.g. 7:00 PM UTC"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as EntryStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tentative">Tentative</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendar-entry-description">Notes (optional)</Label>
              <Textarea
                id="calendar-entry-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Format, hosts, links, or other planning notes"
                rows={3}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !title.trim() ||
                !date ||
                (!isEditing && isRecurring && !recurrenceUntil.trim())
              }
            >
              {isSubmitting ? "Saving..." : isEditing ? "Save changes" : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
