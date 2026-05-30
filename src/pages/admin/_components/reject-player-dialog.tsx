import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";

interface RejectPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  onConfirm: (reason: string) => void;
}

export default function RejectPlayerDialog({ open, onOpenChange, playerName, onConfirm }: RejectPlayerDialogProps) {
  const [reason, setReason] = useState("");
  
  const handleSubmit = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Player</DialogTitle>
          <DialogDescription>
            You are about to reject {playerName}. Please provide a reason for rejection.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-2">
          <Label htmlFor="reason">Rejection Reason</Label>
          <Textarea
            id="reason"
            placeholder="Enter reason for rejection..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>
        
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setReason("");
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason.trim()}
          >
            Reject Player
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
