import { describe, expect, it, vi, afterEach } from "vitest";
import {
  MAP_CREATE_DRAG_THRESHOLD_PX,
  MAP_CREATE_DRAG_THRESHOLD_TOUCH_PX,
} from "./constants";
import { mapDragThresholdPx, prefersCoarsePointer } from "./pointer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prefersCoarsePointer / mapDragThresholdPx", () => {
  it("uses the mouse threshold when the pointer is fine", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false }),
    );
    expect(prefersCoarsePointer()).toBe(false);
    expect(mapDragThresholdPx()).toBe(MAP_CREATE_DRAG_THRESHOLD_PX);
  });

  it("uses the touch threshold when the pointer is coarse", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );
    expect(prefersCoarsePointer()).toBe(true);
    expect(mapDragThresholdPx()).toBe(MAP_CREATE_DRAG_THRESHOLD_TOUCH_PX);
  });
});
