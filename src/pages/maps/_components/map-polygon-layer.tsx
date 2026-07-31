import {
  MAP_BOX_BORDER_WIDTH_PX,
  MAP_BOX_BORDER_WIDTH_SELECTED_PX,
  MAP_BOX_FILL_OPACITY,
  hexToRgba,
  resolveMapBoxColor,
} from "@/lib/maps/box-color.ts";
import { pointsToSvgPath } from "@/lib/maps/polygons.ts";
import type { MapPolygon, MapPolygonPoint } from "@/lib/maps/types";
import { cn } from "@/lib/utils.ts";

type MapPolygonLayerProps = {
  polygon: MapPolygon;
  selected: boolean;
};

export default function MapPolygonLayer({
  polygon,
  selected,
}: MapPolygonLayerProps) {
  const color = resolveMapBoxColor(polygon.color);
  const borderWidth = selected
    ? MAP_BOX_BORDER_WIDTH_SELECTED_PX
    : MAP_BOX_BORDER_WIDTH_PX;
  const fill = hexToRgba(
    color,
    selected ? MAP_BOX_FILL_OPACITY : MAP_BOX_FILL_OPACITY * 0.75,
  );

  return (
    <svg
      data-map-object="polygon"
      data-object-id={polygon.id}
      data-selected={selected ? "true" : "false"}
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full",
        selected ? "z-20" : "z-[15]",
      )}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-label={`Polygon ${polygon.id}`}
      aria-selected={selected}
    >
      <path
        d={pointsToSvgPath(polygon.points)}
        fill={fill}
        stroke={color}
        strokeWidth={(borderWidth / 10) * (selected ? 1.15 : 1)}
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
        opacity={selected ? 1 : 0.85}
        style={
          selected
            ? { filter: `drop-shadow(0 0 0 1px #000) drop-shadow(0 0 0 2px ${color})` }
            : undefined
        }
      />
    </svg>
  );
}

type DraftPolygonProps = {
  points: MapPolygonPoint[];
  cursor: MapPolygonPoint | null;
};

export function DraftMapPolygon({ points, cursor }: DraftPolygonProps) {
  if (points.length === 0) return null;

  const [first, ...rest] = points;
  let d = `M ${first!.x * 100} ${first!.y * 100}`;
  for (const point of rest) {
    d += ` L ${point.x * 100} ${point.y * 100}`;
  }
  if (cursor) {
    d += ` L ${cursor.x * 100} ${cursor.y * 100}`;
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={d}
        fill="color-mix(in oklab, var(--primary) 18%, transparent)"
        stroke="var(--primary)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={point.x * 100}
          cy={point.y * 100}
          r={index === 0 ? 1.4 : 1.1}
          fill={index === 0 ? "var(--primary)" : "var(--background)"}
          stroke="var(--primary)"
          strokeWidth={0.6}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
