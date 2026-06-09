import { useCallback, useEffect, useRef, useState } from "react";
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
  downloadCalendarImage,
  validateExportDateRange,
  type CalendarEntry,
} from "@/lib/potential-event-calendar-export.ts";
import PotentialEventCalendarImageExport from "./potential-event-calendar-image-export.tsx";

interface PotentialEventCalendarExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRangeStart: string;
  defaultRangeEnd: string;
  viewerToken?: string;
}

type ImageExportRequest = {
  entries: CalendarEntry[];
  rangeStart: string;
  rangeEnd: string;
};

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
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [imageExport, setImageExport] = useState<ImageExportRequest | null>(null);
  const imageCaptureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setRangeStart(defaultRangeStart);
    setRangeEnd(defaultRangeEnd);
  }, [open, defaultRangeStart, defaultRangeEnd]);

  const fetchEntries = useCallback(async () => {
    const validationError = validateExportDateRange(rangeStart, rangeEnd);
    if (validationError) {
      toast.error(validationError);
      return null;
    }

    return await convex.query(api.potentialEventCalendar.queries.listEntries, {
      rangeStart,
      rangeEnd,
      ...(viewerToken ? { viewerToken } : {}),
    });
  }, [convex, rangeEnd, rangeStart, viewerToken]);

  const handleExportCsv = async () => {
    setIsExportingCsv(true);
    try {
      const entries = await fetchEntries();
      if (!entries) return;
      downloadCalendarCsv(entries, rangeStart, rangeEnd);
      toast.success("CSV downloaded");
      onOpenChange(false);
    } catch {
      toast.error("Could not export CSV");
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleExportImage = async () => {
    setIsExportingImage(true);
    try {
      const entries = await fetchEntries();
      if (!entries) {
        setIsExportingImage(false);
        return;
      }
      setImageExport({ entries, rangeStart, rangeEnd });
    } catch {
      toast.error("Could not export image");
      setIsExportingImage(false);
    }
  };

  useEffect(() => {
    if (!imageExport) return;

    let cancelled = false;
    void (async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled || !imageCaptureRef.current) return;

      try {
        await downloadCalendarImage(
          imageCaptureRef.current,
          imageExport.rangeStart,
          imageExport.rangeEnd,
        );
        toast.success("Image downloaded");
        onOpenChange(false);
      } catch {
        toast.error("Could not export image");
      } finally {
        if (!cancelled) {
          setImageExport(null);
          setIsExportingImage(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageExport, onOpenChange]);

  const isExporting = isExportingCsv || isExportingImage;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Download calendar</DialogTitle>
            <DialogDescription>
              Export the selected date range as a spreadsheet or calendar image. Empty days are
              included in both formats.
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
            <Button
              type="button"
              variant="outline"
              onClick={handleExportImage}
              disabled={isExporting}
            >
              {isExportingImage ? "Exporting..." : "Download image"}
            </Button>
            <Button type="button" onClick={handleExportCsv} disabled={isExporting}>
              {isExportingCsv ? "Exporting..." : "Download CSV"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {imageExport && (
        <div className="pointer-events-none fixed top-0 -left-[12000px]">
          <PotentialEventCalendarImageExport
            ref={imageCaptureRef}
            entries={imageExport.entries}
            rangeStart={imageExport.rangeStart}
            rangeEnd={imageExport.rangeEnd}
          />
        </div>
      )}
    </>
  );
}
