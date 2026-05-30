import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Download } from "lucide-react";

interface ExportOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (filters: { tiers: string[]; statuses: string[] }) => void;
}

export default function ExportOptionsDialog({ open, onOpenChange, onExport }: ExportOptionsDialogProps) {
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set(["S", "A", "B", "C"]));
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(["active", "archived", "rejected"]));

  const toggleTier = (tier: string) => {
    const newSet = new Set(selectedTiers);
    if (newSet.has(tier)) {
      newSet.delete(tier);
    } else {
      newSet.add(tier);
    }
    setSelectedTiers(newSet);
  };

  const toggleStatus = (status: string) => {
    const newSet = new Set(selectedStatuses);
    if (newSet.has(status)) {
      newSet.delete(status);
    } else {
      newSet.add(status);
    }
    setSelectedStatuses(newSet);
  };

  const selectAllTiers = () => {
    setSelectedTiers(new Set(["S", "A", "B", "C"]));
  };

  const selectAllStatuses = () => {
    setSelectedStatuses(new Set(["active", "archived", "rejected"]));
  };

  const handleExport = () => {
    onExport({
      tiers: Array.from(selectedTiers),
      statuses: Array.from(selectedStatuses),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Player Evaluations</DialogTitle>
          <DialogDescription>
            Select which players to include in your export
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Tier Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-sm">Tiers</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAllTiers}
                className="h-7 text-xs"
              >
                Select All
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {["S", "A", "B", "C"].map((tier) => (
                <div key={tier} className="flex items-center space-x-2">
                  <Checkbox
                    id={`export-tier-${tier}`}
                    checked={selectedTiers.has(tier)}
                    onCheckedChange={() => toggleTier(tier)}
                  />
                  <label
                    htmlFor={`export-tier-${tier}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Tier {tier}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Status Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-sm">Status</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAllStatuses}
                className="h-7 text-xs"
              >
                Select All
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="export-status-active"
                  checked={selectedStatuses.has("active")}
                  onCheckedChange={() => toggleStatus("active")}
                />
                <label
                  htmlFor="export-status-active"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Active
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="export-status-archived"
                  checked={selectedStatuses.has("archived")}
                  onCheckedChange={() => toggleStatus("archived")}
                />
                <label
                  htmlFor="export-status-archived"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Archived
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="export-status-rejected"
                  checked={selectedStatuses.has("rejected")}
                  onCheckedChange={() => toggleStatus("rejected")}
                />
                <label
                  htmlFor="export-status-rejected"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Rejected
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={selectedTiers.size === 0 || selectedStatuses.size === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
