import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAP_BOX_DEFAULT_COLOR,
  MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
} from "@/lib/maps/constants";
import { clampTextCenter, shouldCreateBoxFromDrag } from "@/lib/maps/box-actions";
import { mapDragThresholdPx } from "@/lib/maps/pointer";
import {
  createBoxId,
  moveBox,
  normalizedRectFromDrag,
  pointToNormalized,
  resizeBox,
  type NormalizedPoint,
  type ResizeHandle,
} from "@/lib/maps/coordinates";
import type { BoxesAction } from "@/lib/maps/boxes-reducer";
import {
  hitTestMapObjects,
  isSelectedObject,
  selectBox,
  selectText,
} from "@/lib/maps/selection";
import type { EditorTool, MapBox, MapText, SelectedObject } from "@/lib/maps/types";
import MapBoxLayer, { DraftMapBox } from "./map-box-layer.tsx";
import MapSelectionMenu from "./map-selection-menu.tsx";
import MapSideToolbar from "./map-side-toolbar.tsx";
import MapTextLayer from "./map-text-layer.tsx";
import MapPoiOverlay from "./map-poi-overlay.tsx";

type TextsUpdater = (prev: MapText[]) => MapText[];

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
  | {
      mode: "resizing-box";
      boxId: string;
      handle: ResizeHandle;
      originBox: MapBox;
    }
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
  selection: SelectedObject;
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onBoxesAction: (action: BoxesAction) => void;
  onTextsChange: (updater: TextsUpdater) => void;
  onSelectionChange: (selection: SelectedObject) => void;
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
  onBoxesAction,
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
  const selectionRef = useRef(selection);
  const toolRef = useRef(tool);
  const onBoxesActionRef = useRef(onBoxesAction);
  const onTextsChangeRef = useRef(onTextsChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const interactionRef = useRef<InteractionState>({ mode: "idle" });
  const menuArmTimeoutRef = useRef<number | null>(null);
  /** Active pointer ids on the canvas — size > 1 means pinch / multi-touch. */
  const activePointersRef = useRef(new Set<number>());
  /** When true, skip committing creates / text taps (pinch zoom in progress). */
  const suppressGestureRef = useRef(false);
  /** Text tool: place on pointerup so a pinch does not stamp a label. */
  const pendingTextRef = useRef<NormalizedPoint | null>(null);
  const [interaction, setInteraction] = useState<InteractionState>({ mode: "idle" });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [menuActionsArmed, setMenuActionsArmed] = useState(true);

  boxesRef.current = boxes;
  textsRef.current = texts;
  selectionRef.current = selection;
  toolRef.current = tool;
  onBoxesActionRef.current = onBoxesAction;
  onTextsChangeRef.current = onTextsChange;
  onSelectionChangeRef.current = onSelectionChange;

  const disarmMenuActions = useCallback(() => {
    if (menuArmTimeoutRef.current != null) {
      window.clearTimeout(menuArmTimeoutRef.current);
      menuArmTimeoutRef.current = null;
    }
    setMenuActionsArmed(false);
  }, []);

  const armMenuActionsSoon = useCallback(() => {
    if (menuArmTimeoutRef.current != null) {
      window.clearTimeout(menuArmTimeoutRef.current);
    }
    menuArmTimeoutRef.current = window.setTimeout(() => {
      menuArmTimeoutRef.current = null;
      setMenuActionsArmed(true);
    }, 100);
  }, []);

  const setInteractionState = useCallback((next: InteractionState) => {
    interactionRef.current = next;
    setInteraction(next);
  }, []);

  const finishInteraction = useCallback(() => {
    setInteractionState({ mode: "idle" });
    armMenuActionsSoon();
  }, [armMenuActionsSoon, setInteractionState]);

  const releaseCanvasPointerCaptures = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    for (const pointerId of activePointersRef.current) {
      try {
        if (overlay.hasPointerCapture(pointerId)) {
          overlay.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore: capture may already be released.
      }
    }
  }, []);

  /** Abort draw/move when a second finger lands so the browser can pinch-zoom. */
  const abortGestureForMultiTouch = useCallback(() => {
    suppressGestureRef.current = true;
    pendingTextRef.current = null;
    const current = interactionRef.current;
    if (current.mode === "moving-box") {
      onBoxesActionRef.current({
        type: "patch",
        id: current.boxId,
        box: current.originBox,
      });
    } else if (current.mode === "moving-text") {
      onTextsChangeRef.current((prev) =>
        prev.map((textItem) =>
          textItem.id === current.textId ? current.originText : textItem,
        ),
      );
    } else if (current.mode === "resizing-box") {
      onBoxesActionRef.current({
        type: "patch",
        id: current.boxId,
        box: current.originBox,
      });
    }
    releaseCanvasPointerCaptures();
    setInteractionState({ mode: "idle" });
    armMenuActionsSoon();
  }, [armMenuActionsSoon, releaseCanvasPointerCaptures, setInteractionState]);

  useEffect(() => {
    return () => {
      if (menuArmTimeoutRef.current != null) {
        window.clearTimeout(menuArmTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finishInteraction();
      onSelectionChangeRef.current(null);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finishInteraction]);

  // Bind window pointer listeners once. Handlers always read latest refs so a
  // parent re-render cannot drop pointerup mid-gesture (which previously
  // thrashed these listeners via unstable callback identities).
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
            mapDragThresholdPx(),
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
            mapDragThresholdPx(),
          );
        if (!exceededThreshold) return;

        if (!current.exceededThreshold) {
          setInteractionState({ ...current, exceededThreshold: true });
        }

        const moved = moveBox(current.originBox, point, current.grabOffset);
        onBoxesActionRef.current({
          type: "patch",
          id: current.boxId,
          box: moved,
        });
        return;
      }

      if (current.mode === "resizing-box") {
        onBoxesActionRef.current({
          type: "patch",
          id: current.boxId,
          box: resizeBox(
            current.originBox,
            current.handle,
            point,
            MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
          ),
        });
        return;
      }

      if (current.mode === "moving-text") {
        const exceededThreshold =
          current.exceededThreshold ||
          shouldCreateBoxFromDrag(
            { x: current.startClientX, y: current.startClientY },
            { x: event.clientX, y: event.clientY },
            mapDragThresholdPx(),
          );
        if (!exceededThreshold) return;

        if (!current.exceededThreshold) {
          setInteractionState({ ...current, exceededThreshold: true });
        }

        const next = clampTextCenter(
          point.x - current.grabOffset.x,
          point.y - current.grabOffset.y,
        );
        onTextsChangeRef.current((prev) =>
          prev.map((textItem) =>
            textItem.id === current.textId
              ? { ...current.originText, x: next.x, y: next.y }
              : textItem,
          ),
        );
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      activePointersRef.current.delete(event.pointerId);

      const suppressed = suppressGestureRef.current;
      if (activePointersRef.current.size === 0) {
        suppressGestureRef.current = false;
      }

      const current = interactionRef.current;
      if (current.mode === "idle") return;

      // Pinch / multi-touch aborted the gesture — do not create a box.
      if (suppressed) {
        finishInteraction();
        return;
      }

      const rect = getOverlayRect(overlayRef.current);

      if (current.mode === "creating-box" && rect) {
        const exceededThreshold =
          current.exceededThreshold ||
          shouldCreateBoxFromDrag(
            { x: current.startClientX, y: current.startClientY },
            { x: event.clientX, y: event.clientY },
            mapDragThresholdPx(),
          );

        if (exceededThreshold) {
          const point = pointToNormalized(event.clientX, event.clientY, rect);
          const draft = normalizedRectFromDrag(
            current.start,
            point,
            MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
          );
          const nextBox: MapBox = {
            ...draft,
            id: createBoxId(),
            label: "",
            color: MAP_BOX_DEFAULT_COLOR,
          };
          onBoxesActionRef.current({ type: "append", box: nextBox });
          onSelectionChangeRef.current(selectBox(nextBox.id));
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
  }, [finishInteraction, setInteractionState]);

  const placeTextAt = (point: NormalizedPoint) => {
    const nextText: MapText = {
      id: createBoxId(),
      x: point.x,
      y: point.y,
      text: "",
      color: MAP_BOX_DEFAULT_COLOR,
    };
    onTextsChange((prev) => [...prev, nextText]);
    onSelectionChange(selectText(nextText.id));
    onToolChange("rect");
    armMenuActionsSoon();
    // Focus after React commits the new selected textarea.
    window.setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>(
        `textarea[data-map-text-id="${nextText.id}"]`,
      );
      el?.focus({ preventScroll: true });
      el?.select();
    }, 0);
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (interactionRef.current.mode !== "idle") return;

    const textToolActive = toolRef.current === "text";
    const target = event.target;
    // While the text tool is active, ignore selection chrome so a click on a
    // selected rectangle (handles / menu / selected label) still stamps text.
    if (!textToolActive && target instanceof Element) {
      if (
        target.closest("[data-resize-handle]") ||
        target.closest("[data-map-selection-menu]") ||
        target.closest("textarea[data-map-text-id]")
      ) {
        return;
      }
    }

    activePointersRef.current.add(event.pointerId);

    // Second finger: abort any draw/move so the browser can pinch-zoom the page.
    if (activePointersRef.current.size > 1) {
      abortGestureForMultiTouch();
      return;
    }

    const rect = getOverlayRect(overlayRef.current);
    if (!rect) {
      activePointersRef.current.delete(event.pointerId);
      return;
    }

    disarmMenuActions();
    suppressGestureRef.current = false;

    const point = pointToNormalized(event.clientX, event.clientY, rect);
    const isTouch = event.pointerType === "touch";

    if (textToolActive) {
      // Defer placement until pointerup so a pinch does not stamp text.
      pendingTextRef.current = point;
      if (!isTouch) event.preventDefault();
      return;
    }

    const hit = hitTestMapObjects(
      boxesRef.current,
      textsRef.current,
      point,
      selectionRef.current,
    );

    if (hit?.kind === "box") {
      // Avoid preventDefault on touch so pinch-zoom is not blocked.
      if (!isTouch) event.preventDefault();
      const box = hit.object;
      onSelectionChange(selectBox(box.id));
      setInteractionState({
        mode: "moving-box",
        boxId: box.id,
        grabOffset: { x: point.x - box.x, y: point.y - box.y },
        startClientX: event.clientX,
        startClientY: event.clientY,
        exceededThreshold: false,
        originBox: { ...box },
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (hit?.kind === "text") {
      if (!isTouch) event.preventDefault();
      beginTextMove(hit.object, point, event);
      return;
    }

    onSelectionChange(null);

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

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);

    const pendingText = pendingTextRef.current;
    const suppressed = suppressGestureRef.current;

    if (activePointersRef.current.size === 0) {
      suppressGestureRef.current = false;
    }

    if (!pendingText) return;
    pendingTextRef.current = null;

    // Only stamp text for a clean single-finger / mouse tap.
    if (suppressed || activePointersRef.current.size > 0) return;
    placeTextAt(pendingText);
  };

  const beginTextMove = (
    textItem: MapText,
    point: NormalizedPoint,
    event: React.PointerEvent,
  ) => {
    disarmMenuActions();
    onSelectionChange(selectText(textItem.id));
    setInteractionState({
      mode: "moving-text",
      textId: textItem.id,
      grabOffset: { x: point.x - textItem.x, y: point.y - textItem.y },
      startClientX: event.clientX,
      startClientY: event.clientY,
      exceededThreshold: false,
      originText: { ...textItem },
    });
    overlayRef.current?.setPointerCapture(event.pointerId);
  };

  const handleTextMovePointerDown = (
    textId: string,
    event: React.PointerEvent,
  ) => {
    activePointersRef.current.add(event.pointerId);
    if (activePointersRef.current.size > 1) {
      abortGestureForMultiTouch();
      return;
    }
    if (interactionRef.current.mode !== "idle") return;
    const textItem = textsRef.current.find((entry) => entry.id === textId);
    if (!textItem) return;
    const rect = getOverlayRect(overlayRef.current);
    if (!rect) return;
    if (event.pointerType !== "touch") event.preventDefault();
    const point = pointToNormalized(event.clientX, event.clientY, rect);
    beginTextMove(textItem, point, event);
  };

  const handleResizePointerDown = (
    boxId: string,
    handle: ResizeHandle,
    event: React.PointerEvent,
  ) => {
    if (toolRef.current === "text") return;
    activePointersRef.current.add(event.pointerId);
    if (activePointersRef.current.size > 1) {
      abortGestureForMultiTouch();
      return;
    }
    event.stopPropagation();
    if (event.pointerType !== "touch") event.preventDefault();
    if (interactionRef.current.mode !== "idle") return;
    const box = boxesRef.current.find((entry) => entry.id === boxId);
    if (!box) return;
    disarmMenuActions();
    onSelectionChange(selectBox(boxId));
    setInteractionState({
      mode: "resizing-box",
      boxId,
      handle,
      originBox: { ...box },
    });
  };

  // Hide move/resize/menu chrome while stamping text so it cannot eat clicks.
  const showSelectionMenu =
    tool !== "text" && interaction.mode === "idle" && menuActionsArmed;

  const draftRect =
    interaction.mode === "creating-box" && interaction.exceededThreshold
      ? normalizedRectFromDrag(
          interaction.start,
          interaction.current,
          MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
        )
      : null;

  const selectedBox =
    selection?.type === "box"
      ? (boxes.find((box) => box.id === selection.id) ?? null)
      : null;
  const selectedText =
    selection?.type === "text"
      ? (texts.find((textItem) => textItem.id === selection.id) ?? null)
      : null;

  const focusSelectedText = () => {
    if (!selectedText) return;
    const el = document.querySelector<HTMLTextAreaElement>(
      `textarea[data-map-text-id="${selectedText.id}"]`,
    );
    el?.focus({ preventScroll: true });
    el?.select();
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/*
        Keep the stage square and size-capped so overlays share the same
        coordinate space as the map pixels. w-full + max-h + object-contain
        previously letterboxed the square asset inside a wide box, which
        shoved every POI/box/text left of its landmark.
      */}
      <div className="relative mx-auto w-full max-w-[min(100%,70vh,70dvh)]">
        <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted">
          <img
            src={imageSrc}
            alt="Simpsons Reload dropmap"
            className="absolute inset-0 h-full w-full object-fill"
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
                data-map-canvas=""
                data-box-count={boxes.length}
                className={`absolute inset-0 z-10 touch-pinch-zoom ${
                  tool === "text" ? "cursor-text" : "cursor-crosshair"
                }`}
                onPointerDown={handleCanvasPointerDown}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                aria-label="Map drawing area"
              >
                {boxes.map((box) => (
                  <MapBoxLayer
                    key={box.id}
                    box={box}
                    selected={
                      tool !== "text" &&
                      isSelectedObject(selection, "box", box.id)
                    }
                    onResizePointerDown={handleResizePointerDown}
                  />
                ))}
                {texts.map((textItem) => (
                  <MapTextLayer
                    key={textItem.id}
                    textItem={textItem}
                    selected={
                      tool !== "text" &&
                      isSelectedObject(selection, "text", textItem.id)
                    }
                    onMovePointerDown={handleTextMovePointerDown}
                    onTextChange={(textId, text) => {
                      onTextsChange((prev) =>
                        prev.map((entry) =>
                          entry.id === textId ? { ...entry, text } : entry,
                        ),
                      );
                    }}
                  />
                ))}
                {draftRect ? <DraftMapBox {...draftRect} /> : null}
                {showSelectionMenu && selectedBox && selection?.type === "box" ? (
                  <MapSelectionMenu
                    selection={selection}
                    color={selectedBox.color}
                    x={selectedBox.x + selectedBox.width / 2}
                    y={selectedBox.y}
                    height={selectedBox.height}
                    disabled={colorControlsDisabled}
                    onColorChange={onSelectedColorChange}
                  />
                ) : null}
                {showSelectionMenu && selectedText && selection?.type === "text" ? (
                  <MapSelectionMenu
                    selection={selection}
                    color={selectedText.color}
                    x={selectedText.x}
                    y={selectedText.y}
                    disabled={colorControlsDisabled}
                    onColorChange={onSelectedColorChange}
                    onEditText={focusSelectedText}
                  />
                ) : null}
              </div>
              <MapSideToolbar
                tool={tool}
                onToolChange={onToolChange}
                onSave={onSave}
                onDeleteSelected={
                  selection && menuActionsArmed ? onDeleteSelected : undefined
                }
                isSaving={isSaving}
                isDirty={isDirty}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
