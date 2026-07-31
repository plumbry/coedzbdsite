import { describe, expect, it } from "vitest";
import {
  EXPECTED_SPRINGFIELD_POI_COUNT,
  SPRINGFIELD_POIS,
  SPRINGFIELD_POI_IDS,
} from "./springfield-pois";
import { validateSpringfieldPois } from "./springfield-pois.validation";

describe("SPRINGFIELD_POIS", () => {
  it("contains all nine labels", () => {
    expect(SPRINGFIELD_POIS).toHaveLength(EXPECTED_SPRINGFIELD_POI_COUNT);
    expect(SPRINGFIELD_POI_IDS).toHaveLength(EXPECTED_SPRINGFIELD_POI_COUNT);
    expect(new Set(SPRINGFIELD_POI_IDS).size).toBe(EXPECTED_SPRINGFIELD_POI_COUNT);
  });

  it("uses unique ids and valid coordinates", () => {
    expect(() => validateSpringfieldPois(SPRINGFIELD_POIS)).not.toThrow();

    for (const poi of SPRINGFIELD_POIS) {
      expect(poi.x).toBeGreaterThanOrEqual(0);
      expect(poi.x).toBeLessThanOrEqual(1);
      expect(poi.y).toBeGreaterThanOrEqual(0);
      expect(poi.y).toBeLessThanOrEqual(1);
      expect(poi.width).toBeGreaterThan(0);
      if (poi.fontScale != null) {
        expect(poi.fontScale).toBeGreaterThan(0);
      }
    }
  });

  it("includes every required POI label", () => {
    const labels = SPRINGFIELD_POIS.map((poi) => poi.label);
    expect(labels).toEqual([
      "CLETUS' CORN HOLE",
      "SPRINGFIELD NUCLEAR POWER PLANT",
      "KAMP KRUSTY",
      "EVERGREEN TERRACE",
      "BURNS MANOR",
      "SPRINGFIELD TOWN SQUARE",
      "SPRINGFIELD SLURPWORKS",
      "CORRUPTION CORNERS",
      "DONUT DISTRICT",
    ]);
  });

  it("rejects invalid configurations", () => {
    expect(() =>
      validateSpringfieldPois([
        {
          id: "bad",
          label: "BAD",
          x: 1.2,
          y: 0.5,
          width: 0.1,
        },
      ]),
    ).toThrow();
  });
});
