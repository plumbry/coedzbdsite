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

const toolButtonClass =
  "h-12 w-12 rounded-xl bg-[#fae904] text-black shadow-md hover:bg-[#ffe84a] data-[active=true]:ring-2 data-[active=true]:ring-black/80";

export default function MapSideToolbar({
  tool,
  onToolChange,
  onSave,
  isSaving,
  isDirty,
}: MapSideToolbarProps) {
  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-50 flex flex-col items-stretch gap-3 sm:right-4 sm:top-4">
      <div
        className="flex flex-col gap-1 rounded-2xl bg-[#fae904] p-1.5 shadow-lg"
        role="toolbar"
        aria-label="Drawing tools"
      >
        <button
          type="button"
          data-active={tool === "rect"}
          aria-label="Rectangle tool"
          aria-pressed={tool === "rect"}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-xl text-black transition-colors",
            tool === "rect" ? "bg-black text-[#fae904]" : "hover:bg-black/10",
          )}
          onClick={() => onToolChange("rect")}
        >
          <Square className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </button>
        <button
          type="button"
          data-active={tool === "text"}
          aria-label="Text tool"
          aria-pressed={tool === "text"}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-xl text-black transition-colors",
            tool === "text" ? "bg-black text-[#fae904]" : "hover:bg-black/10",
          )}
          onClick={() => onToolChange("text")}
        >
          <Type className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      <Button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        aria-label="Save map and copy link"
        className={cn(
          toolButtonClass,
          "h-11 w-auto gap-2 px-3 font-bold text-black hover:text-black",
        )}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Save className="h-4 w-4" aria-hidden />
        )}
        Save
      </Button>

      {isDirty ? (
        <span className="rounded-md bg-background/90 px-2 py-1 text-center text-[11px] font-medium text-muted-foreground shadow">
          Unsaved
        </span>
      ) : null}
    </div>
  );
}
