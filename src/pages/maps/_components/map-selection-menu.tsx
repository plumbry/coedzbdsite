import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input.tsx";
import { isValidHexColor, normalizeHexColor } from "@/lib/maps/box-color.ts";
import type { SelectedObject } from "@/lib/maps/types";
import { Paintbrush, Trash2, Type } from "lucide-react";

type MapSelectionMenuProps = {
  selection: NonNullable<SelectedObject>;
  color: string;
  x: number;
  y: number;
  height?: number;
  disabled?: boolean;
  onDelete: () => void;
  onColorChange: (color: string) => void;
  onEditText?: () => void;
};

export default function MapSelectionMenu({
  selection,
  color,
  x,
  y,
  height = 0,
  disabled = false,
  onDelete,
  onColorChange,
  onEditText,
}: MapSelectionMenuProps) {
  const [showColor, setShowColor] = useState(false);
  const [hexDraft, setHexDraft] = useState(color);

  useEffect(() => {
    setHexDraft(color);
    setShowColor(false);
  }, [color, selection.id, selection.type]);

  const handleHexChange = (value: string) => {
    setHexDraft(value);
    const normalized = normalizeHexColor(value);
    if (normalized) onColorChange(normalized);
  };

  const handlePickerChange = (value: string) => {
    const normalized = normalizeHexColor(value);
    if (!normalized) return;
    onColorChange(normalized);
    setHexDraft(normalized);
  };

  const pickerValue = normalizeHexColor(hexDraft) ?? color;
  const hexInvalid = hexDraft.trim().length > 0 && !isValidHexColor(hexDraft);
  const preferBelow = y < 0.14;
  const top = preferBelow ? `${(y + height) * 100}%` : `${y * 100}%`;
  const left = `${x * 100}%`;

  return (
    <div
      data-map-selection-menu=""
      className="pointer-events-auto absolute z-50"
      style={{
        left,
        top,
        transform: preferBelow
          ? "translate(-50%, 10px)"
          : "translate(-50%, calc(-100% - 10px))",
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="relative rounded-xl border border-border bg-white px-1 py-1 text-black shadow-xl">
        {!preferBelow ? (
          <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-white" />
        ) : (
          <div className="absolute bottom-full left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-b-8 border-x-transparent border-b-white" />
        )}

        <div className="flex min-w-[10.5rem] flex-col">
          {selection.type === "text" && onEditText ? (
            <button
              type="button"
              disabled={disabled}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-muted disabled:opacity-50"
              onClick={onEditText}
            >
              <Type className="h-4 w-4" aria-hidden />
              Edit text
            </button>
          ) : null}

          <button
            type="button"
            disabled={disabled}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-muted disabled:opacity-50"
            onClick={() => setShowColor((value) => !value)}
          >
            <Paintbrush className="h-4 w-4" aria-hidden />
            Change colour
          </button>

          <button
            type="button"
            disabled={disabled}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </button>
        </div>

        {showColor ? (
          <div className="mt-1 flex items-center gap-2 border-t border-border px-2 py-2">
            <input
              type="color"
              value={pickerValue}
              disabled={disabled}
              aria-label="Colour picker"
              className="h-8 w-10 cursor-pointer rounded border border-input bg-background p-0.5"
              onChange={(event) => handlePickerChange(event.target.value)}
            />
            <Input
              value={hexDraft}
              disabled={disabled}
              aria-label="Hex colour"
              aria-invalid={hexInvalid}
              spellCheck={false}
              className="h-8 font-mono text-xs uppercase"
              onChange={(event) => handleHexChange(event.target.value)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
