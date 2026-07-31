import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAP_BOX_DEFAULT_COLOR,
  MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
  MAP_CREATE_DRAG_THRESHOLD_PX,
} from "@/lib/maps/constants";
import { clampTextCenter, shouldCreateBoxFromDrag } from "@/lib/maps/box-actions";
import {
  createBoxId,
  moveBox,
  normalizedRectFromDrag,
  pointToNormalized,
  resizeBox,
  type NormalizedPoint,
  type ResizeHandle,
} from "@/lib/maps/coordinates";
import type { EditorTool, MapBox, MapSelection, MapText } from "@/lib/maps/types";
import MapBoxLayer, { DraftMapBox } from "./map-box-layer.tsx";
import MapSelectionMenu from "./map-selection-menu.tsx";
import MapSideToolbar from "./map-side-toolbar.tsx";
import MapTextLayer from "./map-text-layer.tsx";
import MapPoiOverlay from "./map-poi-overlay.tsx";

type InteractionState =
  | { mode: "idle" }
  | {
      mode: "creating-box";
      startClientX: number;
      startClientY: number;
      start: NormalizedPoint;
      current: NormalizedPoint;
      exceededThreshold: boolean;
    }
  | {
      mode: "moving-box";
      boxId: string;
      grabOffset: NormalizedPoint;
      startClientX: number;
      startClientY: number;
      exceededThreshold: boolean;
      originBox: MapBox;
    }
  | { mode: "resizing-box"; boxId: string; handle: ResizeHandle }
  | {
      mode: "moving-text";
      textId: string;
      grabOffset: NormalizedPoint;
      startClientX: number;
      startClientY: number;
      exceededThreshold: boolean;
      originText: MapText;
    };

type MapEditorProps = {
  boxes: MapBox[];
  texts: MapText[];
  selection: MapSelection;
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onBoxesChange: (boxes: MapBox[]) => void;
  onTextsChange: (texts: MapText[]) => void;
  onSelectionChange: (selection: MapSelection) => void;
  onSelectedColorChange: (color: string) => void;
  onDeleteSelected: () => void;
  onSave: () => void;
  imageSrc: string;
  onImageMissing: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  colorControlsDisabled?: boolean;
};

function getOverlayRect(element: HTMLDivElement | null): DOMRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

export default function MapEditor({
  boxes,
  texts,
  selection,
  tool,
  onToolChange,
  onBoxesChange,
  onTextsChange,
  onSelectionChange,
  onSelectedColorChange,
  onDeleteSelected,
  onSave,
  imageSrc,
  onImageMissing,
  isSaving = false,
  isDirty = false,
  colorControlsDisabled = false,
}: MapEditorProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const boxesRef = useRef(boxes);
  const textsRef = useRef(texts);
  const toolRef = useRef(tool);
  const interactionRef = useRef<InteractionState>({ mode: "idle" });
  const [interaction, setInteraction] = useState<InteractionState>({ mode: "idle" });
  const [imageLoaded, setImageLoaded] = useState(false);

  boxesRef.current = boxes;
  textsRef.current = texts;
  toolRef.current = tool;

  const setInteractionState = useCallback((next: InteractionState) => {
    interactionRef.current = next;
    setInteraction(next);
  }, []);

  const finishInteraction = useCallback(() => {
    setInteractionState({ mode: "idle" });
  }, [setInteractionState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finishInteraction();
      onSelectionChange(null);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finishInteraction, onSelectionChange]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = interactionRef.current;
      if (current.mode === "idle") return;

      const rect = getOverlayRect(overlayRef.current);
      if (!rect) return;
      const point = pointToNormalized(event.clientX, event.clientY, rect);

      if (current.mode === "creating-box") {
        const exceededThreshold =
          current.exceededThreshold ||
          shouldCreateBoxFromDrag(
            { x: current.startClientX, y: current.startClientY },
            { x: event.clientX, y: event.clientY },
            MAP_CREATE_DRAG_THRESHOLD_PX,
          );
        setInteractionState({
          ...current,
          current: point,
          exceededThreshold,
        });
        return;
      }

      if (current.mode === "moving-box") {
        const exceededThreshold =
          current.exceededThreshold ||
          shouldCreateBoxFromDrag(
            { x: current.startClientX, y: current.startClientY },
            { x: event.clientX, y: event.clientY },
            MAP_CREATE_DRAG_THRESHOLD_PX,
          );
        if (!exceededThreshold) return;

        if (!current.exceededThreshold) {
          setInteractionState({ ...current, exceededThreshold: true });
        }

        onBoxesChange(
          boxesRef.current.map((box) =>
            box.id === current.boxId
              ? moveBox(current.originBox, point, current.grabOffset)
              : box,
          ),
        );
        return;
      }

      if (current.mode === "resizing-box") {
        onBoxesChange(
          boxesRef.current.map((box) =>
            box.id === current.boxId
              ? resizeBox(box, current.handle, point, MAP_BOX_DEFAULT_MIN_DRAG_SIZE)
              : box,
          ),
        );
        return;
      }

      if (current.mode === "moving-text") {
        const exceededThreshold =
          current.exceededThreshold ||
          shouldCreateBoxFromDrag(
            { x: current.startClientX, y: current.startClientY },
            { x: event.clientX, y: event.clientY },
            MAP_CREATE_DRAG_THRESHOLD_PX,
          );
        if (!exceededThreshold) return;

        if (!current.exceededThreshold) {
          setInteractionState({ ...current, exceededThreshold: true });
        }

        const next = clampTextCenter(
          point.x - current.grabOffset.x,
          point.y - current.grabOffset.y,
        );
        onTextsChange(
          textsRef.current.map((textItem) =>
            textItem.id === current.textId
              ? { ...current.originText, x: next.x, y: next.y }
              : textItem,
          ),
        );
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = interactionRef.current;
      if (current.mode === "idle") return;

      const rect = getOverlayRect(overlayRef.current);

      if (current.mode === "creating-box" && rect) {
        const exceededThreshold =
          current.exceededThreshold ||
          shouldCreateBoxFromDrag(
            { x: current.startClientX, y: current.startClientY },
            { x: event.clientX, y: event.clientY },
            MAP_CREATE_DRAG_THRESHOLD_PX,
          );

        if (exceededThreshold) {
          const point = pointToNormalized(event.clientX, event.clientY, rect);
          const draft = normalizedRectFromDrag(
            current.start,
            point,
            MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
          );
          const nextBox: MapBox = {
            id: createBoxId(),
            ...draft,
            label: "",
            color: MAP_BOX_DEFAULT_COLOR,
          };
          onBoxesChange([...boxesRef.current, nextBox]);
          onSelectionChange({ kind: "box", id: nextBox.id });
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
    finishInteraction,
    onBoxesChange,
    onSelectionChange,
    onTextsChange,
    setInteractionState,
  ]);

  const handleOverlayPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (interactionRef.current.mode !== "idle") return;
    if (event.target !== event.currentTarget) return;

    const rect = getOverlayRect(overlayRef.current);
    if (!rect) return;

    const point = pointToNormalized(event.clientX, event.clientY, rect);
    onSelectionChange(null);

    if (toolRef.current === "text") {
      const nextText: MapText = {
        id: createBoxId(),
        x: point.x,
        y: point.y,
        text: "",
        color: MAP_BOX_DEFAULT_COLOR,
      };
      onTextsChange([...textsRef.current, nextText]);
      onSelectionChange({ kind: "text", id: nextText.id });
      return;
    }

    setInteractionState({
      mode: "creating-box",
      startClientX: event.clientX,
      startClientY: event.clientY,
      start: point,
      current: point,
      exceededThreshold: false,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleBoxPointerDown = (boxId: string, event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (interactionRef.current.mode !== "idle") return;

    const rect = getOverlayRect(overlayRef.current);
    if (!rect) return;

    const box = boxesRef.current.find((entry) => entry.id === boxId);
    if (!box) return;

    const point = pointToNormalized(event.clientX, event.clientY, rect);
    onSelectionChange({ kind: "box", id: boxId });
    setInteractionState({
      mode: "moving-box",
      boxId,
      grabOffset: { x: point.x - box.x, y: point.y - box.y },
      startClientX: event.clientX,
      startClientY: event.clientY,
      exceededThreshold: false,
      originBox: box,
    });
  };

  const handleTextPointerDown = (textId: string, event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (interactionRef.current.mode !== "idle") return;

    const rect = getOverlayRect(overlayRef.current);
    if (!rect) return;

    const textItem = textsRef.current.find((entry) => entry.id === textId);
    if (!textItem) return;

    const point = pointToNormalized(event.clientX, event.clientY, rect);
    onSelectionChange({ kind: "text", id: textId });
    setInteractionState({
      mode: "moving-text",
      textId,
      grabOffset: { x: point.x - textItem.x, y: point.y - textItem.y },
      startClientX: event.clientX,
      startClientY: event.clientY,
      exceededThreshold: false,
      originText: textItem,
    });
  };

  const handleResizePointerDown = (
    boxId: string,
    handle: ResizeHandle,
    event: React.PointerEvent,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    if (interactionRef.current.mode !== "idle") return;
    onSelectionChange({ kind: "box", id: boxId });
    setInteractionState({ mode: "resizing-box", boxId, handle });
  };

  const draftRect =
    interaction.mode === "creating-box" && interaction.exceededThreshold
      ? normalizedRectFromDrag(
          interaction.start,
          interaction.current,
          MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
        )
      : null;

  const selectedBox =
    selection?.kind === "box"
      ? (boxes.find((box) => box.id === selection.id) ?? null)
      : null;
  const selectedText =
    selection?.kind === "text"
      ? (texts.find((textItem) => textItem.id === selection.id) ?? null)
      : null;

  const focusSelectedText = () => {
    if (!selectedText) return;
    const el = document.querySelector<HTMLTextAreaElement>(
      `textarea[data-map-text-id="${selectedText.id}"]`,
    );
    el?.focus();
    el?.select();
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative inline-block w-full max-w-full">
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
              className={`absolute inset-0 z-10 touch-none ${
                tool === "text" ? "cursor-text" : "cursor-crosshair"
              }`}
              onPointerDown={handleOverlayPointerDown}
              aria-label="Map drawing area"
            >
              {boxes.map((box) => (
                <MapBoxLayer
                  key={box.id}
                  box={box}
                  selected={selection?.kind === "box" && selection.id === box.id}
                  onBoxPointerDown={handleBoxPointerDown}
                  onResizePointerDown={handleResizePointerDown}
                />
              ))}
              {texts.map((textItem) => (
                <MapTextLayer
                  key={textItem.id}
                  textItem={textItem}
                  selected={selection?.kind === "text" && selection.id === textItem.id}
                  onTextPointerDown={handleTextPointerDown}
                  onTextChange={(textId, text) => {
                    onTextsChange(
                      textsRef.current.map((entry) =>
                        entry.id === textId ? { ...entry, text } : entry,
                      ),
                    );
                  }}
                />
              ))}
              {draftRect ? <DraftMapBox {...draftRect} /> : null}
              {selectedBox && selection?.kind === "box" ? (
                <MapSelectionMenu
                  selection={selection}
                  color={selectedBox.color}
                  x={selectedBox.x + selectedBox.width / 2}
                  y={selectedBox.y}
                  height={selectedBox.height}
                  disabled={colorControlsDisabled}
                  onDelete={onDeleteSelected}
                  onColorChange={onSelectedColorChange}
                />
              ) : null}
              {selectedText && selection?.kind === "text" ? (
                <MapSelectionMenu
                  selection={selection}
                  color={selectedText.color}
                  x={selectedText.x}
                  y={selectedText.y}
                  disabled={colorControlsDisabled}
                  onDelete={onDeleteSelected}
                  onColorChange={onSelectedColorChange}
                  onEditText={focusSelectedText}
                />
              ) : null}
            </div>
            <MapSideToolbar
              tool={tool}
              onToolChange={onToolChange}
              onSave={onSave}
              isSaving={isSaving}
              isDirty={isDirty}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
