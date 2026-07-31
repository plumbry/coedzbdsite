import {
  MAP_BOX_BORDER_WIDTH_PX,
  MAP_BOX_BORDER_WIDTH_SELECTED_PX,
  MAP_BOX_FILL_OPACITY,
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
  onResizePointerDown: (
    boxId: string,
    handle: ResizeHandle,
    event: React.PointerEvent,
  ) => void;
};

/**
 * Visual + resize chrome for one rectangle.
 * Hit-testing / selection is owned by MapEditor geometry picking so a shared
 * overlay cannot select the whole annotation layer.
 */
export default function MapBoxLayer({
  box,
  selected,
  onResizePointerDown,
}: MapBoxLayerProps) {
  const boxColor = resolveMapBoxColor(box.color);
  const borderWidth = selected ? MAP_BOX_BORDER_WIDTH_SELECTED_PX : MAP_BOX_BORDER_WIDTH_PX;
  const fill = hexToRgba(boxColor, selected ? MAP_BOX_FILL_OPACITY : MAP_BOX_FILL_OPACITY * 0.75);

  return (
    <div
      data-map-object="box"
      data-object-id={box.id}
      data-selected={selected ? "true" : "false"}
      className={cn(
        "pointer-events-none absolute select-none",
        selected ? "z-20" : "z-10",
      )}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
      }}
      aria-label={`Rectangle ${box.id}`}
      aria-selected={selected}
    >
      <div
        className="h-full w-full rounded-sm"
        style={{
          border: `${borderWidth}px solid ${boxColor}`,
          backgroundColor: fill,
          boxShadow: selected ? `0 0 0 1px #000, 0 0 0 3px ${boxColor}` : undefined,
          opacity: selected ? 1 : 0.85,
        }}
      />
      {selected
        ? HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              data-resize-handle={handle}
              aria-label={`Resize ${handle}`}
              className={cn(
                "pointer-events-auto absolute z-30 h-2.5 w-2.5 rounded-full border bg-background shadow touch-none",
                handlePositionClass[handle],
              )}
              style={{ borderColor: boxColor }}
              onPointerDown={(event) => onResizePointerDown(box.id, handle, event)}
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
      className="pointer-events-none absolute z-30 rounded-sm border-2 border-dashed"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
        borderColor: "var(--primary)",
        backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)",
      }}
    />
  );
}
