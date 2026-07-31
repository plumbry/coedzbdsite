import { Button } from "@/components/ui/button.tsx";
import { mobileButtonRowClass } from "@/lib/mobile-buttons.ts";
import { cn } from "@/lib/utils.ts";
import { Copy, Plus, RefreshCw } from "lucide-react";

type MapHeaderActionsProps = {
  onNew: () => void;
  onCopyLink: () => void;
  onReloadFromServer: () => void;
  canReloadFromServer: boolean;
  isSaving: boolean;
  newLabel?: string;
  reloadLabel?: string;
};

export default function MapHeaderActions({
  onNew,
  onCopyLink,
  onReloadFromServer,
  canReloadFromServer,
  isSaving,
  newLabel = "New",
  reloadLabel = "Reload",
}: MapHeaderActionsProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", mobileButtonRowClass)}
      role="toolbar"
      aria-label="Map page actions"
    >
      <Button type="button" variant="outline" onClick={onNew} aria-label={newLabel}>
        <Plus className="h-4 w-4" aria-hidden />
        {newLabel}
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={onCopyLink}
        disabled={isSaving}
        aria-label="Copy share link"
      >
        <Copy className="h-4 w-4" aria-hidden />
        Copy link
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onReloadFromServer}
        disabled={!canReloadFromServer || isSaving}
        aria-label={reloadLabel}
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        {reloadLabel}
      </Button>
    </div>
  );
}
