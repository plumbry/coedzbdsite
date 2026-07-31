import {
  getContrastTextColor,
  resolveMapBoxColor,
} from "@/lib/maps/box-color.ts";
import type { MapText } from "@/lib/maps/types";
import { cn } from "@/lib/utils.ts";

const TEXT_MAX_LENGTH = 200;

type MapTextLayerProps = {
  textItem: MapText;
  selected: boolean;
  onTextPointerDown: (textId: string, event: React.PointerEvent) => void;
  onTextChange: (textId: string, text: string) => void;
};

export default function MapTextLayer({
  textItem,
  selected,
  onTextPointerDown,
  onTextChange,
}: MapTextLayerProps) {
  const color = resolveMapBoxColor(textItem.color);
  const outline = getContrastTextColor(color) === "#FFFFFF" ? "#000000" : "#FFFFFF";

  return (
    <div
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 touch-none",
        selected ? "z-30" : "z-20",
      )}
      style={{
        left: `${textItem.x * 100}%`,
        top: `${textItem.y * 100}%`,
        minWidth: "4rem",
        maxWidth: "40%",
      }}
      onPointerDown={(event) => onTextPointerDown(textItem.id, event)}
    >
      <textarea
        data-map-text-id={textItem.id}
        value={textItem.text}
        maxLength={TEXT_MAX_LENGTH}
        rows={Math.min(4, Math.max(1, textItem.text.split("\n").length))}
        placeholder="Text"
        aria-label="Map text label"
        readOnly={!selected}
        tabIndex={selected ? 0 : -1}
        className={cn(
          "w-full resize-none bg-transparent px-1.5 py-1 text-center text-xs font-black uppercase leading-tight outline-none sm:text-sm",
          selected ? "ring-2 ring-offset-1 ring-offset-transparent" : "",
        )}
        style={{
          color,
          textShadow: `0 0 2px ${outline}, 1px 1px 0 ${outline}, -1px -1px 0 ${outline}, 1px -1px 0 ${outline}, -1px 1px 0 ${outline}`,
          ...(selected ? { boxShadow: `0 0 0 2px ${color}` } : {}),
        }}
        onPointerDown={(event) => {
          if (!selected) {
            onTextPointerDown(textItem.id, event);
            return;
          }
          event.stopPropagation();
        }}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          if (!selected) return;
          onTextChange(textItem.id, event.target.value);
        }}
      />
    </div>
  );
}
