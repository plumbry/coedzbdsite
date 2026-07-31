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
  onBoxPointerDown: (boxId: string, event: React.PointerEvent) => void;
  onResizePointerDown: (
    boxId: string,
    handle: ResizeHandle,
    event: React.PointerEvent,
  ) => void;
};

export default function MapBoxLayer({
  box,
  selected,
  onBoxPointerDown,
  onResizePointerDown,
}: MapBoxLayerProps) {
  const boxColor = resolveMapBoxColor(box.color);
  const borderWidth = selected ? MAP_BOX_BORDER_WIDTH_SELECTED_PX : MAP_BOX_BORDER_WIDTH_PX;
  const fill = hexToRgba(boxColor, MAP_BOX_FILL_OPACITY);

  return (
    <div
      className={cn("absolute touch-none select-none", selected ? "z-20" : "z-10")}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
      }}
      onPointerDown={(event) => onBoxPointerDown(box.id, event)}
    >
      <div
        className="h-full w-full rounded-sm"
        style={{
          border: `${borderWidth}px solid ${boxColor}`,
          backgroundColor: fill,
        }}
        aria-label={`Rectangle ${box.id}`}
      />
      {selected
        ? HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              aria-label={`Resize ${handle}`}
              className={cn(
                "absolute z-30 h-2.5 w-2.5 rounded-full border bg-background shadow touch-none",
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
        borderColor: "#FAE904",
        backgroundColor: "rgba(250, 233, 4, 0.22)",
      }}
    />
  );
}
