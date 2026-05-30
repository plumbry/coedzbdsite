import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";

interface ArchivePlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  onConfirm: (reason: "left server" | "application incomplete" | "no tier role" | "other") => void;
}

export default function ArchivePlayerDialog({ 
  open, 
  onOpenChange, 
  playerName, 
  onConfirm 
}: ArchivePlayerDialogProps) {
  const [reason, setReason] = useState<"left server" | "application incomplete" | "no tier role" | "other">("other");

  const handleConfirm = () => {
    onConfirm(reason);
    onOpenChange(false);
    setReason("other");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive Player</DialogTitle>
          <DialogDescription>
            Archive <span className="font-semibold">{playerName}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="archiveReason">Archive Reason</Label>
            <Select value={reason} onValueChange={(value) => setReason(value as typeof reason)}>
              <SelectTrigger id="archiveReason">
                <SelectValue placeholder="Select reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left server">Left Server</SelectItem>
                <SelectItem value="application incomplete">Application Incomplete</SelectItem>
                <SelectItem value="no tier role">No Tier Role</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Archive Player
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
