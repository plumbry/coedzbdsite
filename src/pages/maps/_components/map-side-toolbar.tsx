import { Button } from "@/components/ui/button.tsx";
import type { EditorTool } from "@/lib/maps/types";
import { cn } from "@/lib/utils.ts";
import { Loader2, Save, Square, Type } from "lucide-react";

type MapSideToolbarProps = {
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
};

export default function MapSideToolbar({
  tool,
  onToolChange,
  onSave,
  isSaving,
  isDirty,
}: MapSideToolbarProps) {
  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-50 flex flex-col items-stretch gap-2 sm:right-4 sm:top-4">
      <div
        className="flex flex-col gap-1 rounded-xl border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur-sm"
        role="toolbar"
        aria-label="Drawing tools"
      >
        <button
          type="button"
          data-active={tool === "rect"}
          aria-label="Rectangle tool"
          aria-pressed={tool === "rect"}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
            tool === "rect"
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          onClick={() => onToolChange("rect")}
        >
          <Square className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>
        <button
          type="button"
          data-active={tool === "text"}
          aria-label="Text tool"
          aria-pressed={tool === "text"}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
            tool === "text"
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          onClick={() => onToolChange("text")}
        >
          <Type className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      <Button
        type="button"
        variant="default"
        onClick={onSave}
        disabled={isSaving}
        aria-label="Save map and copy link"
        className="h-10 gap-2 px-3 font-semibold shadow-lg"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Save className="h-4 w-4" aria-hidden />
        )}
        Save
      </Button>

      {isDirty ? (
        <span className="rounded-md border border-border bg-background/95 px-2 py-1 text-center text-[11px] font-medium text-muted-foreground shadow">
          Unsaved
        </span>
      ) : null}
    </div>
  );
}
