import {
  MAP_CREATE_DRAG_THRESHOLD_PX,
  MAP_CREATE_DRAG_THRESHOLD_TOUCH_PX,
} from "./constants";

/** True when the primary input is a finger / stylus-class pointer. */
export function prefersCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Drag threshold in CSS pixels for create / move gestures. */
export function mapDragThresholdPx(): number {
  return prefersCoarsePointer()
    ? MAP_CREATE_DRAG_THRESHOLD_TOUCH_PX
    : MAP_CREATE_DRAG_THRESHOLD_PX;
}
