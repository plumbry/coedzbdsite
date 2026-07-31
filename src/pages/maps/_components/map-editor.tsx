import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAP_BOX_DEFAULT_COLOR,
  MAP_BOX_DEFAULT_MIN_DRAG_SIZE,
  MAP_POLYGON_CLOSE_THRESHOLD,
  MAP_POLYGON_MAX_POINTS,
  MAP_POLYGON_MIN_POINTS,
} from "@/lib/maps/constants";
import { clampTextCenter, shouldCreateBoxFromDrag } from "@/lib/maps/box-actions";
import { mapDragThresholdPx, prefersCoarsePointer } from "@/lib/maps/pointer";
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
import type { PolygonsAction } from "@/lib/maps/polygons-reducer";
import { movePolygon, polygonBounds } from "@/lib/maps/polygons";
import {
  hitTestMapObjects,
  isSelectedObject,
  selectBox,
  selectPolygon,
  selectText,
} from "@/lib/maps/selection";
import type {
  EditorTool,
  MapBox,
  MapPolygon,
  MapText,
  SelectedObject,
} from "@/lib/maps/types";
import MapBoxLayer, { DraftMapBox } from "./map-box-layer.tsx";
import MapPolygonLayer, { DraftMapPolygon } from "./map-polygon-layer.tsx";
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
    }
  | {
      mode: "creating-polygon";
      points: NormalizedPoint[];
      cursor: NormalizedPoint | null;
    }
  | {
      mode: "moving-polygon";
      polygonId: string;
      grabOffset: NormalizedPoint;
      startClientX: number;
      startClientY: number;
      exceededThreshold: boolean;
      originPolygon: MapPolygon;
    };

type MapEditorProps = {
  boxes: MapBox[];
  texts: MapText[];
  polygons: MapPolygon[];
  selection: SelectedObject;
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onBoxesAction: (action: BoxesAction) => void;
  onPolygonsAction: (action: PolygonsAction) => void;
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
  polygons,
  selection,
  tool,
  onToolChange,
  onBoxesAction,
  onPolygonsAction,
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
  const polygonsRef = useRef(polygons);
  const selectionRef = useRef(selection);
  const toolRef = useRef(tool);
  const onBoxesActionRef = useRef(onBoxesAction);
  const onPolygonsActionRef = useRef(onPolygonsAction);
  const onTextsChangeRef = useRef(onTextsChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onToolChangeRef = useRef(onToolChange);
  const interactionRef = useRef<InteractionState>({ mode: "idle" });
  const menuArmTimeoutRef = useRef<number | null>(null);
  /** Active pointer ids on the canvas — size > 1 means pinch / multi-touch. */
  const activePointersRef = useRef(new Set<number>());
  /** When true, skip committing creates / text taps (pinch zoom in progress). */
  const suppressGestureRef = useRef(false);
  /**
   * Sticky for the whole pinch: once two fingers are seen, do not create/move
   * annotations until every finger has lifted (pointerdown often misses finger 2).
   */
  const gestureBlockedRef = useRef(false);
  /** Text tool: place on pointerup so a pinch does not stamp a label. */
  const pendingTextRef = useRef<NormalizedPoint | null>(null);
  const [interaction, setInteraction] = useState<InteractionState>({ mode: "idle" });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [menuActionsArmed, setMenuActionsArmed] = useState(true);

  boxesRef.current = boxes;
  textsRef.current = texts;
  polygonsRef.current = polygons;
  selectionRef.current = selection;
  toolRef.current = tool;
  onBoxesActionRef.current = onBoxesAction;
  onPolygonsActionRef.current = onPolygonsAction;
  onTextsChangeRef.current = onTextsChange;
  onSelectionChangeRef.current = onSelectionChange;
  onToolChangeRef.current = onToolChange;

  const idleToolAfterCreate = () =>
    prefersCoarsePointer() ? "select" : "rect";

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

  /** Commits a polygon draft. Reads via refs so it stays stable for the
   * window keydown effect (Enter-to-finish) as well as pointer handlers. */
  const finishPolygon = useCallback(
    (points: NormalizedPoint[]) => {
      if (points.length < MAP_POLYGON_MIN_POINTS) return;
      const nextPolygon: MapPolygon = {
        id: createBoxId(),
        points: points.map((point) => ({ x: point.x, y: point.y })),
        color: MAP_BOX_DEFAULT_COLOR,
      };
      onPolygonsActionRef.current({ type: "append", polygon: nextPolygon });
      onSelectionChangeRef.current(selectPolygon(nextPolygon.id));
      onToolChangeRef.current(idleToolAfterCreate());
      finishInteraction();
    },
    [finishInteraction],
  );

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
    gestureBlockedRef.current = true;
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
    } else if (current.mode === "moving-polygon") {
      onPolygonsActionRef.current({
        type: "patch",
        id: current.polygonId,
        polygon: current.originPolygon,
      });
    }
    // "creating-box" / "creating-polygon" — drop the draft, do not commit.
    releaseCanvasPointerCaptures();
    setInteractionState({ mode: "idle" });
    armMenuActionsSoon();
  }, [armMenuActionsSoon, releaseCanvasPointerCaptures, setInteractionState]);

  const clearGestureFlagsWhenIdle = useCallback(() => {
    if (activePointersRef.current.size > 0) return;
    // Defer so every pointerup in this frame still sees the blocked flag.
    window.requestAnimationFrame(() => {
      if (activePointersRef.current.size > 0) return;
      suppressGestureRef.current = false;
      gestureBlockedRef.current = false;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (menuArmTimeoutRef.current != null) {
        window.clearTimeout(menuArmTimeoutRef.current);
      }
    };
  }, []);

  // touchstart sees concurrent fingers even when the 2nd pointerdown never
  // hits the canvas (common once the first finger has pointer capture).
  useEffect(() => {
    const onTouchChange = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        abortGestureForMultiTouch();
        return;
      }
      if (event.touches.length === 0) {
        activePointersRef.current.clear();
        clearGestureFlagsWhenIdle();
      }
    };
    window.addEventListener("touchstart", onTouchChange, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchend", onTouchChange, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchcancel", onTouchChange, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("touchstart", onTouchChange, true);
      window.removeEventListener("touchend", onTouchChange, true);
      window.removeEventListener("touchcancel", onTouchChange, true);
    };
  }, [abortGestureForMultiTouch, clearGestureFlagsWhenIdle]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        const current = interactionRef.current;
        if (
          current.mode === "creating-polygon" &&
          current.points.length >= MAP_POLYGON_MIN_POINTS
        ) {
          event.preventDefault();
          finishPolygon(current.points);
        }
        return;
      }

      if (event.key !== "Escape") return;
      event.preventDefault();
      // Draft polygons have no committed data yet, so going idle fully
      // cancels them — no extra cleanup needed here.
      finishInteraction();
      onSelectionChangeRef.current(null);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finishInteraction, finishPolygon]);

  // Bind window pointer listeners once. Handlers always read latest refs so a
  // parent re-render cannot drop pointerup mid-gesture (which previously
  // thrashed these listeners via unstable callback identities).
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (gestureBlockedRef.current || suppressGestureRef.current) return;

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

      if (current.mode === "creating-polygon") {
        setInteractionState({ ...current, cursor: point });
        return;
      }

      if (current.mode === "moving-polygon") {
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

        const moved = movePolygon(current.originPolygon, point, current.grabOffset);
        onPolygonsActionRef.current({
          type: "patch",
          id: current.polygonId,
          polygon: moved,
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

      const blocked =
        suppressGestureRef.current || gestureBlockedRef.current;

      const current = interactionRef.current;
      if (current.mode === "idle") {
        clearGestureFlagsWhenIdle();
        return;
      }

      // Pinch / multi-touch — never commit a box or other draft.
      if (blocked) {
        if (current.mode !== "creating-polygon") {
          finishInteraction();
        } else {
          // Drop in-progress polygon vertices as well.
          setInteractionState({ mode: "idle" });
          armMenuActionsSoon();
        }
        clearGestureFlagsWhenIdle();
        return;
      }

      // Polygon vertices are placed on pointerdown clicks, not drags — a
      // pointerup here (e.g. after adding a vertex) must not finish the draft.
      if (current.mode === "creating-polygon") {
        clearGestureFlagsWhenIdle();
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
          onToolChangeRef.current(idleToolAfterCreate());
        }
      }

      finishInteraction();
      clearGestureFlagsWhenIdle();
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
    armMenuActionsSoon,
    clearGestureFlagsWhenIdle,
    finishInteraction,
    setInteractionState,
  ]);

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
    onToolChange(idleToolAfterCreate());
    armMenuActionsSoon();
    // Focus after React commits the new selected input.
    window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(
        `[data-map-text-id="${nextText.id}"]`,
      );
      el?.focus({ preventScroll: true });
      el?.select();
    }, 0);
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const activeInteraction = interactionRef.current;
    // A polygon draft stays "active" between clicks (each click adds a
    // vertex), so it must keep receiving pointerdown events like idle does.
    if (
      activeInteraction.mode !== "idle" &&
      activeInteraction.mode !== "creating-polygon"
    ) {
      return;
    }

    // Mid-pinch: ignore new drawing until every finger has lifted.
    if (gestureBlockedRef.current) {
      activePointersRef.current.add(event.pointerId);
      return;
    }

    const textToolActive = toolRef.current === "text";
    const target = event.target;
    // While the text tool is active, ignore selection chrome so a click on a
    // selected rectangle (handles / menu / selected label) still stamps text.
    if (!textToolActive && target instanceof Element) {
      if (
        target.closest("[data-resize-handle]") ||
        target.closest("[data-map-selection-menu]") ||
        target.closest("[data-map-text-id]")
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
    // Do not clear gestureBlockedRef here — only clearGestureFlagsWhenIdle does.

    const point = pointToNormalized(event.clientX, event.clientY, rect);
    const isTouch = event.pointerType === "touch";
    // Pointer capture on touch blocks the browser from pinching; window
    // listeners already track moves for mouse/pen with or without capture.
    const capturePointer = () => {
      if (!isTouch) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    };

    // Touch + select tool: browse / pinch only — no create or object grabs.
    if (toolRef.current === "select" && (isTouch || prefersCoarsePointer())) {
      return;
    }

    // A polygon draft is already underway — clicks add vertices or close it,
    // regardless of which tool is currently selected.
    if (activeInteraction.mode === "creating-polygon") {
      if (!isTouch) event.preventDefault();
      const first = activeInteraction.points[0];
      const canClose =
        activeInteraction.points.length >= MAP_POLYGON_MIN_POINTS &&
        first != null &&
        Math.hypot(point.x - first.x, point.y - first.y) <=
          MAP_POLYGON_CLOSE_THRESHOLD;

      if (canClose) {
        finishPolygon(activeInteraction.points);
        return;
      }

      if (activeInteraction.points.length >= MAP_POLYGON_MAX_POINTS) {
        // At the cap: only closing near the first vertex (above) or Enter finishes.
        return;
      }

      setInteractionState({
        ...activeInteraction,
        points: [...activeInteraction.points, point],
        cursor: point,
      });
      return;
    }

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
      polygonsRef.current,
    );

    if (hit?.kind === "polygon") {
      if (!isTouch) event.preventDefault();
      beginPolygonMove(hit.object, point, event);
      return;
    }

    if (toolRef.current === "polygon") {
      // Polygon tool takes priority over box/text hits for placement — start
      // a new draft instead of selecting whatever is underneath the click.
      if (!isTouch) event.preventDefault();
      onSelectionChange(null);
      setInteractionState({
        mode: "creating-polygon",
        points: [point],
        cursor: point,
      });
      return;
    }

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
      capturePointer();
      return;
    }

    if (hit?.kind === "text") {
      if (!isTouch) event.preventDefault();
      beginTextMove(hit.object, point, event);
      return;
    }

    onSelectionChange(null);

    // Boxes are only drawn with the rectangle tool selected.
    if (toolRef.current !== "rect") {
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
    capturePointer();
  };

  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const current = interactionRef.current;
    if (current.mode !== "creating-polygon") return;
    // The second click of the double-click already added a vertex — drop it
    // so finish uses the vertices placed before the closing double-click.
    const points = current.points.slice(0, -1);
    if (points.length < MAP_POLYGON_MIN_POINTS) return;
    event.preventDefault();
    finishPolygon(points);
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);

    const pendingText = pendingTextRef.current;
    const blocked =
      suppressGestureRef.current || gestureBlockedRef.current;

    if (!pendingText) {
      clearGestureFlagsWhenIdle();
      return;
    }
    pendingTextRef.current = null;

    // Only stamp text for a clean single-finger / mouse tap.
    if (blocked || activePointersRef.current.size > 0) {
      clearGestureFlagsWhenIdle();
      return;
    }
    placeTextAt(pendingText);
    clearGestureFlagsWhenIdle();
  };

  const beginPolygonMove = (
    polygon: MapPolygon,
    point: NormalizedPoint,
    event: React.PointerEvent,
  ) => {
    const bounds = polygonBounds(polygon.points);
    onSelectionChange(selectPolygon(polygon.id));
    setInteractionState({
      mode: "moving-polygon",
      polygonId: polygon.id,
      grabOffset: { x: point.x - bounds.x, y: point.y - bounds.y },
      startClientX: event.clientX,
      startClientY: event.clientY,
      exceededThreshold: false,
      originPolygon: { ...polygon },
    });
    if (event.pointerType !== "touch") {
      overlayRef.current?.setPointerCapture(event.pointerId);
    }
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
    if (event.pointerType !== "touch") {
      overlayRef.current?.setPointerCapture(event.pointerId);
    }
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

  // Hide move/resize/menu chrome while stamping text, or while drafting a
  // polygon, so neither can eat clicks meant for the draft / text stamp.
  const showSelectionMenu =
    tool !== "text" && interaction.mode === "idle" && menuActionsArmed;

  // Selection chrome (handles / rings / menu) hides during a polygon draft so
  // it cannot intercept the clicks that build the draft.
  const chromeVisible = tool !== "text" && interaction.mode !== "creating-polygon";

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
  const selectedPolygon =
    selection?.type === "polygon"
      ? (polygons.find((polygon) => polygon.id === selection.id) ?? null)
      : null;
  const selectedPolygonBounds = selectedPolygon
    ? polygonBounds(selectedPolygon.points)
    : null;

  const focusSelectedText = () => {
    if (!selectedText) return;
    const el = document.querySelector<HTMLInputElement>(
      `[data-map-text-id="${selectedText.id}"]`,
    );
    el?.focus({ preventScroll: true });
    el?.select();
  };

  return (
    <div className="mx-auto w-full">
      {/*
        Keep the stage square and width-driven so overlays share the same
        coordinate space as the map pixels. w-full + max-h + object-contain
        previously letterboxed the square asset inside a wide box, which
        shoved every POI/box/text left of its landmark. Cap is the page shell
        (up to 1600px).
      */}
      <div className="relative mx-auto w-full">
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
                  tool === "text"
                    ? "cursor-text"
                    : tool === "select"
                      ? "cursor-default"
                      : "cursor-crosshair"
                }`}
                onPointerDown={handleCanvasPointerDown}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                onDoubleClick={handleCanvasDoubleClick}
                aria-label="Map drawing area"
              >
                {boxes.map((box) => (
                  <MapBoxLayer
                    key={box.id}
                    box={box}
                    selected={
                      chromeVisible && isSelectedObject(selection, "box", box.id)
                    }
                    onResizePointerDown={handleResizePointerDown}
                  />
                ))}
                {polygons.map((polygon) => (
                  <MapPolygonLayer
                    key={polygon.id}
                    polygon={polygon}
                    selected={
                      chromeVisible &&
                      isSelectedObject(selection, "polygon", polygon.id)
                    }
                  />
                ))}
                {texts.map((textItem) => (
                  <MapTextLayer
                    key={textItem.id}
                    textItem={textItem}
                    selected={
                      chromeVisible &&
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
                {interaction.mode === "creating-polygon" ? (
                  <DraftMapPolygon
                    points={interaction.points}
                    cursor={interaction.cursor}
                  />
                ) : null}
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
                {showSelectionMenu &&
                selectedPolygon &&
                selectedPolygonBounds &&
                selection?.type === "polygon" ? (
                  <MapSelectionMenu
                    selection={selection}
                    color={selectedPolygon.color}
                    x={selectedPolygonBounds.x + selectedPolygonBounds.width / 2}
                    y={selectedPolygonBounds.y}
                    height={selectedPolygonBounds.height}
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
