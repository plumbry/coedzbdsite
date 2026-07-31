import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAP_BOX_DEFAULT_COLOR,
  MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
  MAP_CREATE_DRAG_THRESHOLD_PX,
} from "@/lib/maps/constants";
import { shouldCreateBoxFromDrag } from "@/lib/maps/box-actions";
import {
  createBoxId,
  moveBox,
  normalizedRectFromDrag,
  pointToNormalized,
  resizeBox,
  type NormalizedPoint,
  type ResizeHandle,
} from "@/lib/maps/coordinates";
import type { MapBox } from "@/lib/maps/types";
import MapBoxLayer, { DraftMapBox } from "./map-box-layer.tsx";
import MapPoiOverlay from "./map-poi-overlay.tsx";

type InteractionState =
  | { mode: "idle" }
  | {
      mode: "creating";
      startClientX: number;
      startClientY: number;
      start: NormalizedPoint;
      current: NormalizedPoint;
      exceededThreshold: boolean;
    }
  | { mode: "moving"; boxId: string; grabOffset: NormalizedPoint }
  | { mode: "resizing"; boxId: string; handle: ResizeHandle };

type MapEditorProps = {
  boxes: MapBox[];
  selectedBoxId: string | null;
  onBoxesChange: (boxes: MapBox[]) => void;
  onSelectedBoxIdChange: (boxId: string | null) => void;
  imageSrc: string;
  onImageMissing: () => void;
};

function getOverlayRect(element: HTMLDivElement | null): DOMRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

export default function MapEditor({
  boxes,
  selectedBoxId,
  onBoxesChange,
  onSelectedBoxIdChange,
  imageSrc,
  onImageMissing,
}: MapEditorProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<InteractionState>({ mode: "idle" });
  const [imageLoaded, setImageLoaded] = useState(false);

  const updateBox = useCallback(
    (boxId: string, updater: (box: MapBox) => MapBox) => {
      onBoxesChange(boxes.map((box) => (box.id === boxId ? updater(box) : box)));
    },
    [boxes, onBoxesChange],
  );

  const finishInteraction = useCallback(() => {
    setInteraction({ mode: "idle" });
  }, []);

  const cancelInteraction = useCallback(() => {
    finishInteraction();
    onSelectedBoxIdChange(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [finishInteraction, onSelectedBoxIdChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelInteraction();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelInteraction]);

  useEffect(() => {
    if (interaction.mode === "idle") return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = getOverlayRect(overlayRef.current);
      if (!rect) return;
      const point = pointToNormalized(event.clientX, event.clientY, rect);

      if (interaction.mode === "creating") {
        const exceededThreshold =
          interaction.exceededThreshold ||
          shouldCreateBoxFromDrag(
            { x: interaction.startClientX, y: interaction.startClientY },
            { x: event.clientX, y: event.clientY },
            MAP_CREATE_DRAG_THRESHOLD_PX,
          );
        setInteraction({
          mode: "creating",
          startClientX: interaction.startClientX,
          startClientY: interaction.startClientY,
          start: interaction.start,
          current: point,
          exceededThreshold,
        });
        return;
      }

      if (interaction.mode === "moving") {
        const box = boxes.find((entry) => entry.id === interaction.boxId);
        if (!box) return;
        updateBox(interaction.boxId, (current) =>
          moveBox(current, point, interaction.grabOffset),
        );
        return;
      }

      if (interaction.mode === "resizing") {
        const box = boxes.find((entry) => entry.id === interaction.boxId);
        if (!box) return;
        updateBox(interaction.boxId, (current) =>
          resizeBox(current, interaction.handle, point, MAP_BOX_DEFAULT_MIN_DRAG_SIZE),
        );
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const rect = getOverlayRect(overlayRef.current);
      if (!rect) {
        finishInteraction();
        return;
      }

      if (interaction.mode === "creating") {
        const exceededThreshold =
          interaction.exceededThreshold ||
          shouldCreateBoxFromDrag(
            { x: interaction.startClientX, y: interaction.startClientY },
            { x: event.clientX, y: event.clientY },
            MAP_CREATE_DRAG_THRESHOLD_PX,
          );

        if (exceededThreshold) {
          const point = pointToNormalized(event.clientX, event.clientY, rect);
          const draft = normalizedRectFromDrag(
            interaction.start,
            point,
            MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
          );
          const nextBox: MapBox = {
            id: createBoxId(),
            ...draft,
            label: "",
            color: MAP_BOX_DEFAULT_COLOR,
          };
          onBoxesChange([...boxes, nextBox]);
          onSelectedBoxIdChange(nextBox.id);
        }
      }

      finishInteraction();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [
    boxes,
    finishInteraction,
    interaction,
    onBoxesChange,
    onSelectedBoxIdChange,
    updateBox,
  ]);

  const handleOverlayPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (interaction.mode !== "idle") return;
    const rect = getOverlayRect(overlayRef.current);
    if (!rect) return;

    const point = pointToNormalized(event.clientX, event.clientY, rect);
    onSelectedBoxIdChange(null);
    setInteraction({
      mode: "creating",
      startClientX: event.clientX,
      startClientY: event.clientY,
      start: point,
      current: point,
      exceededThreshold: false,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMovePointerDown = (boxId: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (interaction.mode !== "idle") return;
    const rect = getOverlayRect(overlayRef.current);
    if (!rect) return;

    const box = boxes.find((entry) => entry.id === boxId);
    if (!box) return;

    const point = pointToNormalized(event.clientX, event.clientY, rect);
    setInteraction({
      mode: "moving",
      boxId,
      grabOffset: { x: point.x - box.x, y: point.y - box.y },
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerDown = (
    boxId: string,
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (interaction.mode !== "idle") return;
    setInteraction({ mode: "resizing", boxId, handle });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const draftRect =
    interaction.mode === "creating" && interaction.exceededThreshold
      ? normalizedRectFromDrag(
          interaction.start,
          interaction.current,
          MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
        )
      : null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative inline-block max-w-full">
        <img
          src={imageSrc}
          alt="Simpsons Reload dropmap"
          className="block h-auto max-h-[70vh] w-full max-w-full rounded-lg border bg-muted object-contain"
          draggable={false}
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setImageLoaded(false);
            onImageMissing();
          }}
        />
        {imageLoaded ? (
          <>
            <MapPoiOverlay />
            <div
              ref={overlayRef}
              className="absolute inset-0 z-10 touch-none cursor-crosshair"
              onPointerDown={handleOverlayPointerDown}
              aria-label="Map drawing area"
            >
              {boxes.map((box) => (
                <MapBoxLayer
                  key={box.id}
                  box={box}
                  selected={box.id === selectedBoxId}
                  onSelect={onSelectedBoxIdChange}
                  onLabelChange={(boxId, label) => {
                    updateBox(boxId, (current) => ({ ...current, label }));
                  }}
                  onMovePointerDown={handleMovePointerDown}
                  onResizePointerDown={handleResizePointerDown}
                />
              ))}
              {draftRect ? <DraftMapBox {...draftRect} /> : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
