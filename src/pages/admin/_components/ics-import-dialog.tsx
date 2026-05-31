import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
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
import { Upload, FileText } from "lucide-react";
import { toast } from "sonner";

type ICSImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export default function ICSImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: ICSImportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [defaultType, setDefaultType] = useState<string>("scrim");
  const [defaultMode, setDefaultMode] = useState<string>("ZB Main Map");
  const [isImporting, setIsImporting] = useState(false);
  
  const parseAndImportICS = useAction(api.events.icsImport.parseAndImportICS);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith(".ics")) {
      setSelectedFile(file);
    } else {
      toast.error("Please select a valid .ics file");
      e.target.value = "";
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error("Please select an ICS file");
      return;
    }

    setIsImporting(true);
    try {
      // Read file content
      const fileContent = await selectedFile.text();

      // Import events
      const result = await parseAndImportICS({
        icsContent: fileContent,
        defaultType: defaultType as "scrim" | "minicup" | "season" | "mini-season" | "random" | "random-squads" | "random-trios",
        defaultMode: defaultMode as "ZB Main Map" | "Reload",
      });

      toast.success(`Successfully imported ${result.eventsCreated} event${result.eventsCreated === 1 ? "" : "s"}`);
      
      // Reset state
      setSelectedFile(null);
      setDefaultType("scrim");
      setDefaultMode("ZB Main Map");
      
      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
      
      // Close dialog
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to import ICS file";
      toast.error(errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Import Events from ICS File</DialogTitle>
          <DialogDescription>
            Upload an ICS (iCalendar) file to automatically create events. You can add leaderboard links after importing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="ics-file">ICS File</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ics-file"
                type="file"
                accept=".ics"
                onChange={handleFileChange}
                disabled={isImporting}
              />
              {selectedFile && (
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
            </div>
            {selectedFile && (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedFile.name}
              </p>
            )}
          </div>

          {/* Default Event Type */}
          <div className="space-y-2">
            <Label htmlFor="default-type">Default Event Type</Label>
            <Select value={defaultType} onValueChange={setDefaultType} disabled={isImporting}>
              <SelectTrigger id="default-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scrim">Scrim</SelectItem>
                <SelectItem value="minicup">Minicup</SelectItem>
                <SelectItem value="season">Season</SelectItem>
                <SelectItem value="mini-season">Mini Season</SelectItem>
                <SelectItem value="random">Random</SelectItem>
                <SelectItem value="random-squads">Random Squads</SelectItem>
                <SelectItem value="random-trios">Random Trios</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              All imported events will use this type
            </p>
          </div>

          {/* Default Mode */}
          <div className="space-y-2">
            <Label htmlFor="default-mode">Default Mode</Label>
            <Select value={defaultMode} onValueChange={setDefaultMode} disabled={isImporting}>
              <SelectTrigger id="default-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ZB Main Map">ZB Main Map</SelectItem>
                <SelectItem value="Reload">Reload</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              All imported events will use this mode
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
          >
            {isImporting ? (
              "Importing..."
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import Events
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
