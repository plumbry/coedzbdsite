import { useEffect, useState } from "react";
import type { SelectedObject } from "@/lib/maps/types";
import { Paintbrush, Type } from "lucide-react";
import MapColorPicker from "./map-color-picker.tsx";

type MapSelectionMenuProps = {
  selection: NonNullable<SelectedObject>;
  color: string;
  x: number;
  y: number;
  height?: number;
  disabled?: boolean;
  onColorChange: (color: string) => void;
  onEditText?: () => void;
};

/**
 * Floating colour / edit controls for the selected object.
 * Delete lives on the side toolbar so a menu overlay cannot eat map clicks
 * and remove another box by accident.
 */
export default function MapSelectionMenu({
  selection,
  color,
  x,
  y,
  height = 0,
  disabled = false,
  onColorChange,
  onEditText,
}: MapSelectionMenuProps) {
  const [showColor, setShowColor] = useState(false);

  useEffect(() => {
    setShowColor(false);
  }, [selection.id, selection.type]);

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
      <div className="relative rounded-xl border border-border bg-card px-1 py-1 text-foreground shadow-xl">
        {!preferBelow ? (
          <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-card" />
        ) : (
          <div className="absolute bottom-full left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-b-8 border-x-transparent border-b-card" />
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
        </div>

        {showColor ? (
          <div className="mt-1 border-t border-border">
            <MapColorPicker
              color={color}
              disabled={disabled}
              onColorChange={onColorChange}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
