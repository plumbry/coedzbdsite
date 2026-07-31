import { resolveMapBoxColor } from "@/lib/maps/box-color.ts";
import type { MapText } from "@/lib/maps/types";
import { cn } from "@/lib/utils.ts";

const TEXT_MAX_LENGTH = 200;

type MapTextLayerProps = {
  textItem: MapText;
  selected: boolean;
  onTextChange: (textId: string, text: string) => void;
  onMovePointerDown?: (
    textId: string,
    event: React.PointerEvent,
  ) => void;
};

/**
 * Visual + edit chrome for one text object.
 * Selection/move hit-testing is owned by MapEditor geometry picking for
 * unselected labels; the selected label forwards pointerdown so drag-to-move
 * still works (edit via the selection menu / double-click).
 */
export default function MapTextLayer({
  textItem,
  selected,
  onTextChange,
  onMovePointerDown,
}: MapTextLayerProps) {
  const color = resolveMapBoxColor(textItem.color);

  return (
    <div
      data-map-object="text"
      data-object-id={textItem.id}
      data-selected={selected ? "true" : "false"}
      className={cn(
        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2",
        selected ? "z-30" : "z-20",
      )}
      style={{
        left: `${textItem.x * 100}%`,
        top: `${textItem.y * 100}%`,
        minWidth: "4rem",
        maxWidth: "40%",
      }}
      aria-selected={selected}
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
          // Unselected text must stay pointer-events:none so canvas geometry
          // picking owns selection. Selected text captures pointers so we can
          // start a move (and edit via double-click / menu).
          selected ? "pointer-events-auto ring-2 ring-black/80" : "pointer-events-none",
        )}
        style={{ color }}
        onPointerDown={(event) => {
          if (!selected) return;
          // Start move from the label itself; otherwise the text tool would
          // treat the click as empty space and spawn another label.
          event.stopPropagation();
          onMovePointerDown?.(textItem.id, event);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          event.currentTarget.focus();
          event.currentTarget.select();
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
