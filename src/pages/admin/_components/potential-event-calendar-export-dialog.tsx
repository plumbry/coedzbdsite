import { useEffect, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
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
  downloadCalendarCsv,
  validateExportDateRange,
} from "@/lib/potential-event-calendar-export.ts";

interface PotentialEventCalendarExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRangeStart: string;
  defaultRangeEnd: string;
  viewerToken?: string;
}

export default function PotentialEventCalendarExportDialog({
  open,
  onOpenChange,
  defaultRangeStart,
  defaultRangeEnd,
  viewerToken,
}: PotentialEventCalendarExportDialogProps) {
  const convex = useConvex();
  const [rangeStart, setRangeStart] = useState(defaultRangeStart);
  const [rangeEnd, setRangeEnd] = useState(defaultRangeEnd);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRangeStart(defaultRangeStart);
    setRangeEnd(defaultRangeEnd);
  }, [open, defaultRangeStart, defaultRangeEnd]);

  const handleExport = async () => {
    const validationError = validateExportDateRange(rangeStart, rangeEnd);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsExporting(true);
    try {
      const entries = await convex.query(api.potentialEventCalendar.queries.listEntries, {
        rangeStart,
        rangeEnd,
        ...(viewerToken ? { viewerToken } : {}),
      });
      downloadCalendarCsv(entries, rangeStart, rangeEnd);
      toast.success("Calendar exported");
      onOpenChange(false);
    } catch {
      toast.error("Could not export calendar");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Download calendar</DialogTitle>
          <DialogDescription>
            Export one row per day in the range. Days without events are included with blank
            event fields.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="export-range-start">Start date</Label>
              <Input
                id="export-range-start"
                type="date"
                value={rangeStart}
                max={rangeEnd || undefined}
                onChange={(e) => setRangeStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-range-end">End date</Label>
              <Input
                id="export-range-end"
                type="date"
                value={rangeEnd}
                min={rangeStart || undefined}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Exporting..." : "Download CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
