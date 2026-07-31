import { resolveMapBoxColor } from "@/lib/maps/box-color.ts";
import type { MapText } from "@/lib/maps/types";
import { cn } from "@/lib/utils.ts";

const TEXT_MAX_LENGTH = 200;

/** Thin black halo so labels stay readable on the busy map art. */
const MAP_TEXT_OUTLINE_SHADOW =
  "-1px -1px 0 #000, 0 -1px 0 #000, 1px -1px 0 #000, " +
  "-1px 0 0 #000, 1px 0 0 #000, " +
  "-1px 1px 0 #000, 0 1px 0 #000, 1px 1px 0 #000";

type MapTextLayerProps = {
  textItem: MapText;
  selected: boolean;
  onTextChange: (textId: string, text: string) => void;
  onMovePointerDown?: (
    textId: string,
    event: React.PointerEvent,
  ) => void;
};

function singleLineText(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

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
  const display = textItem.text;
  // Grow with content so the label stays one line; ch tracks monospace-ish width
  // well enough for bold uppercase map labels.
  const charCount = Math.max(4, (display || "Text").length + 1);

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
      }}
      aria-selected={selected}
    >
      <input
        type="text"
        data-map-text-id={textItem.id}
        value={display}
        maxLength={TEXT_MAX_LENGTH}
        placeholder="Text"
        aria-label="Map text label"
        readOnly={!selected}
        tabIndex={selected ? 0 : -1}
        className={cn(
          // text-base on small screens avoids iOS zoom-on-focus (<16px).
          "block resize-none overflow-hidden whitespace-nowrap bg-transparent px-1.5 py-1 text-center text-base font-black uppercase leading-none outline-none sm:text-sm",
          // Unselected text must stay pointer-events:none so canvas geometry
          // picking owns selection. Selected text captures pointers so we can
          // start a move (and edit via double-click / menu).
          selected
            ? "pointer-events-auto touch-manipulation ring-2 ring-black/80"
            : "pointer-events-none",
        )}
        style={{
          color,
          width: `${charCount}ch`,
          minWidth: "4ch",
          WebkitTextStroke: "1.5px #000",
          paintOrder: "stroke fill",
          textShadow: MAP_TEXT_OUTLINE_SHADOW,
        }}
        onPointerDown={(event) => {
          if (!selected) return;
          // Start move from the label itself; otherwise the text tool would
          // treat the click as empty space and spawn another label.
          event.stopPropagation();
          onMovePointerDown?.(textItem.id, event);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.select();
        }}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          if (!selected) return;
          onTextChange(textItem.id, singleLineText(event.target.value));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
