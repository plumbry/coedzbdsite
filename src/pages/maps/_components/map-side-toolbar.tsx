import { Button } from "@/components/ui/button.tsx";
import type { EditorTool } from "@/lib/maps/types";
import { cn } from "@/lib/utils.ts";
import {
  Loader2,
  MousePointer2,
  Pentagon,
  Save,
  Square,
  Trash2,
  Type,
} from "lucide-react";

type MapSideToolbarProps = {
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onSave: () => void;
  onDeleteSelected?: () => void;
  isSaving: boolean;
  isDirty: boolean;
};

const toolButtonClass =
  "inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-md transition-colors sm:h-7 sm:w-7";

export default function MapSideToolbar({
  tool,
  onToolChange,
  onSave,
  onDeleteSelected,
  isSaving,
  isDirty,
}: MapSideToolbarProps) {
  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-50 flex w-auto flex-col items-end gap-1.5 sm:right-4 sm:top-4">
      <div
        className="flex flex-col gap-0.5 rounded-md border border-border/80 bg-background/90 p-0.5 shadow-sm backdrop-blur-sm"
        role="toolbar"
        aria-label="Drawing tools"
      >
        <button
          type="button"
          data-active={tool === "select"}
          aria-label="Select tool"
          aria-pressed={tool === "select"}
          className={cn(
            toolButtonClass,
            tool === "select"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={() => onToolChange("select")}
        >
          <MousePointer2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
        <button
          type="button"
          data-active={tool === "rect"}
          aria-label="Rectangle tool"
          aria-pressed={tool === "rect"}
          className={cn(
            toolButtonClass,
            tool === "rect"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={() => onToolChange("rect")}
        >
          <Square className="h-4 w-4 sm:h-3.5 sm:w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
        <button
          type="button"
          data-active={tool === "polygon"}
          aria-label="Polygon tool"
          aria-pressed={tool === "polygon"}
          className={cn(
            toolButtonClass,
            tool === "polygon"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={() => onToolChange("polygon")}
        >
          <Pentagon className="h-4 w-4 sm:h-3.5 sm:w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
        <button
          type="button"
          data-active={tool === "text"}
          aria-label="Text tool"
          aria-pressed={tool === "text"}
          className={cn(
            toolButtonClass,
            tool === "text"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={() => onToolChange("text")}
        >
          <Type className="h-4 w-4 sm:h-3.5 sm:w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      {onDeleteSelected ? (
        <button
          type="button"
          aria-label="Delete selected object"
          className={cn(
            toolButtonClass,
            "border border-border/80 bg-background/90 text-destructive shadow-sm backdrop-blur-sm hover:bg-destructive/10",
          )}
          onClick={onDeleteSelected}
        >
          <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}

      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={onSave}
        disabled={isSaving}
        aria-label="Save map and copy link"
        className="h-10 touch-manipulation gap-1.5 px-3 text-sm font-semibold shadow-sm sm:h-7 sm:px-2.5 sm:text-xs"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin sm:h-3.5 sm:w-3.5" aria-hidden />
        ) : (
          <Save className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden />
        )}
        Save
      </Button>

      {isDirty ? (
        <span className="rounded px-1.5 py-0.5 text-center text-[10px] font-medium text-muted-foreground">
          Unsaved
        </span>
      ) : null}
    </div>
  );
}
