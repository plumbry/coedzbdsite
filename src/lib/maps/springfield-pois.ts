export type MapPoi = {
  id: string;
  label: string;
  /** Horizontal centre of the label, 0–1 relative to the map image. */
  x: number;
  /** Vertical centre of the label, 0–1 relative to the map image. */
  y: number;
  /** Label width as a fraction of the map image width. */
  width: number;
  /** Optional scale multiplier applied to the responsive base font size. */
  fontScale?: number;
};

/**
 * Normalized POI label positions for the clean Springfield Reload map asset.
 * Coordinates are aligned to island geography (not raw screenshot pixels).
 */
export const SPRINGFIELD_POIS: MapPoi[] = [
  {
    id: "cletus-corn-hole",
    label: "CLETUS' CORN HOLE",
    x: 0.24,
    y: 0.21,
    width: 0.17,
  },
  {
    id: "springfield-nuclear-power-plant",
    label: "SPRINGFIELD NUCLEAR POWER PLANT",
    x: 0.76,
    y: 0.19,
    width: 0.3,
    fontScale: 0.82,
  },
  {
    id: "kamp-krusty",
    label: "KAMP KRUSTY",
    x: 0.53,
    y: 0.29,
    width: 0.14,
  },
  {
    id: "evergreen-terrace",
    label: "EVERGREEN TERRACE",
    x: 0.23,
    y: 0.43,
    width: 0.19,
  },
  {
    id: "burns-manor",
    label: "BURNS MANOR",
    x: 0.77,
    y: 0.45,
    width: 0.15,
  },
  {
    id: "springfield-town-square",
    label: "SPRINGFIELD TOWN SQUARE",
    x: 0.5,
    y: 0.53,
    width: 0.22,
    fontScale: 0.9,
  },
  {
    id: "springfield-slurpworks",
    label: "SPRINGFIELD SLURPWORKS",
    x: 0.22,
    y: 0.67,
    width: 0.23,
    fontScale: 0.88,
  },
  {
    id: "corruption-corners",
    label: "CORRUPTION CORNERS",
    x: 0.5,
    y: 0.74,
    width: 0.2,
  },
  {
    id: "donut-district",
    label: "DONUT DISTRICT",
    x: 0.73,
    y: 0.79,
    width: 0.15,
  },
];

export const SPRINGFIELD_POI_IDS = SPRINGFIELD_POIS.map((poi) => poi.id);

export const EXPECTED_SPRINGFIELD_POI_COUNT = 9;
