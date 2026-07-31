import { describe, expect, it } from "vitest";
import {
  movePolygon,
  pointInPolygon,
  polygonBounds,
  polygonsEqual,
} from "./polygons";
import type { MapPolygon } from "./types";

const triangle: MapPolygon = {
  id: "poly-1",
  color: "#FAE904",
  points: [
    { x: 0.2, y: 0.2 },
    { x: 0.5, y: 0.2 },
    { x: 0.35, y: 0.5 },
  ],
};

describe("pointInPolygon", () => {
  it("detects points inside and outside a triangle", () => {
    expect(pointInPolygon({ x: 0.35, y: 0.3 }, triangle)).toBe(true);
    expect(pointInPolygon({ x: 0.1, y: 0.1 }, triangle)).toBe(false);
  });
});

describe("movePolygon", () => {
  it("translates all vertices and clamps to the map", () => {
    const moved = movePolygon(triangle, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.1 });
    const bounds = polygonBounds(moved.points);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(1 + 1e-9);
    expect(moved.points).toHaveLength(3);
  });
});

describe("polygonsEqual", () => {
  it("compares point lists", () => {
    expect(polygonsEqual([triangle], [{ ...triangle }])).toBe(true);
    expect(
      polygonsEqual(
        [triangle],
        [
          {
            ...triangle,
            points: [
              { x: 0.2, y: 0.2 },
              { x: 0.5, y: 0.21 },
              { x: 0.35, y: 0.5 },
            ],
          },
        ],
      ),
    ).toBe(false);
  });
});
