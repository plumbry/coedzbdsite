import { MAP_BOX_LABEL_MAX_LENGTH } from "@/lib/maps/constants";
import {
  MAP_BOX_BORDER_WIDTH_PX,
  MAP_BOX_BORDER_WIDTH_SELECTED_PX,
  MAP_BOX_FILL_OPACITY,
  getContrastTextColor,
  hexToRgba,
  resolveMapBoxColor,
} from "@/lib/maps/box-color.ts";
import type { MapBox } from "@/lib/maps/types";
import { cn } from "@/lib/utils.ts";
import type { ResizeHandle } from "@/lib/maps/coordinates";

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const handlePositionClass: Record<ResizeHandle, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

type MapBoxLayerProps = {
  box: MapBox;
  selected: boolean;
  onSelect: (boxId: string) => void;
  onLabelChange: (boxId: string, label: string) => void;
  onMovePointerDown: (boxId: string, event: React.PointerEvent<HTMLDivElement>) => void;
  onResizePointerDown: (
    boxId: string,
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
};

export default function MapBoxLayer({
  box,
  selected,
  onSelect,
  onLabelChange,
  onMovePointerDown,
  onResizePointerDown,
}: MapBoxLayerProps) {
  const boxColor = resolveMapBoxColor(box.color);
  const labelColor = getContrastTextColor(boxColor);
  const borderWidth = selected ? MAP_BOX_BORDER_WIDTH_SELECTED_PX : MAP_BOX_BORDER_WIDTH_PX;

  return (
    <div
      className={cn(
        "absolute touch-none select-none",
        selected ? "z-20" : "z-10",
      )}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(box.id);
        onMovePointerDown(box.id, event);
      }}
    >
      <div
        className="flex h-full w-full items-center justify-center rounded-sm p-1"
        style={{
          borderColor: boxColor,
          borderWidth,
          borderStyle: "solid",
          backgroundColor: hexToRgba(boxColor, MAP_BOX_FILL_OPACITY),
        }}
      >
        <input
          type="text"
          value={box.label}
          maxLength={MAP_BOX_LABEL_MAX_LENGTH}
          placeholder="Label"
          aria-label={`Label for box ${box.id}`}
          className="w-full bg-transparent text-center text-xs font-semibold outline-none placeholder:opacity-70 sm:text-sm"
          style={{ color: labelColor }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onLabelChange(box.id, event.target.value)}
        />
      </div>
      {selected
        ? HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              aria-label={`Resize ${handle}`}
              className={cn(
                "absolute z-30 h-2 w-2 rounded-full border border-border bg-background shadow-sm touch-none",
                handlePositionClass[handle],
              )}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect(box.id);
                onResizePointerDown(box.id, handle, event);
              }}
            />
          ))
        : null}
    </div>
  );
}

type DraftBoxProps = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function DraftMapBox({ x, y, width, height }: DraftBoxProps) {
  return (
    <div
      className="pointer-events-none absolute z-30 border-2 border-dashed border-primary"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
        backgroundColor: "rgba(59, 130, 246, 0.15)",
      }}
    />
  );
}
