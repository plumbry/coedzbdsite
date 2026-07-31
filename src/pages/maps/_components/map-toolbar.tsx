import { Button } from "@/components/ui/button.tsx";
import { mobileButtonRowClass } from "@/lib/mobile-buttons.ts";
import { cn } from "@/lib/utils.ts";
import {
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";

type MapToolbarProps = {
  isSaving: boolean;
  hasSelection: boolean;
  onNew: () => void;
  onSave: () => void;
  onCopyLink: () => void;
  onDeleteSelected: () => void;
  onReloadFromServer: () => void;
  canReloadFromServer: boolean;
  isDirty: boolean;
};

export default function MapToolbar({
  isSaving,
  hasSelection,
  onNew,
  onSave,
  onCopyLink,
  onDeleteSelected,
  onReloadFromServer,
  canReloadFromServer,
  isDirty,
}: MapToolbarProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", mobileButtonRowClass)}
      role="toolbar"
      aria-label="Map editor actions"
    >
      <Button type="button" variant="outline" onClick={onNew} aria-label="Create new map">
        <Plus className="h-4 w-4" aria-hidden />
        New
      </Button>
      <Button type="button" onClick={onSave} disabled={isSaving} aria-label="Save map and copy link">
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Save className="h-4 w-4" aria-hidden />
        )}
        Save
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={onCopyLink}
        disabled={isSaving}
        aria-label="Save and copy share link"
      >
        <Copy className="h-4 w-4" aria-hidden />
        Copy link
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onDeleteSelected}
        disabled={!hasSelection || isSaving}
        aria-label="Delete selected box"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        Delete selected
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onReloadFromServer}
        disabled={!canReloadFromServer || isSaving}
        aria-label="Reload map from server"
      >
        <RefreshCw className="h-4 w-4" aria-hidden />
        Reload
      </Button>
      {isDirty ? (
        <span className="text-xs text-muted-foreground sm:text-sm">Unsaved changes</span>
      ) : null}
    </div>
  );
}
