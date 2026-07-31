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

  // Keep the menu on-screen on narrow viewports (centred transform otherwise clips).
  const clampedX = Math.min(0.88, Math.max(0.12, x));
  // Colour picker is tall — flip below/above based on vertical room.
  const preferBelow = showColor ? y < 0.45 : y < 0.18;
  const top = preferBelow ? `${(y + height) * 100}%` : `${y * 100}%`;
  const left = `${clampedX * 100}%`;

  return (
    <div
      data-map-selection-menu=""
      className="pointer-events-auto absolute z-50 max-w-[min(18rem,calc(100%-1rem))] touch-auto"
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
              className="flex min-h-11 touch-manipulation items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-muted disabled:opacity-50 sm:min-h-0 sm:py-2"
              onClick={onEditText}
            >
              <Type className="h-4 w-4 shrink-0" aria-hidden />
              Edit text
            </button>
          ) : null}

          <button
            type="button"
            disabled={disabled}
            className="flex min-h-11 touch-manipulation items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-muted disabled:opacity-50 sm:min-h-0 sm:py-2"
            onClick={() => setShowColor((value) => !value)}
          >
            <Paintbrush className="h-4 w-4 shrink-0" aria-hidden />
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
