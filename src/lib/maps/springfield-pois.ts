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
 * Normalized POI label centres for the clean Springfield Reload map asset.
 * Derived from the labelled reference screenshot by mapping island-relative
 * label centres onto the square production map (including ocean padding).
 */
export const SPRINGFIELD_POIS: MapPoi[] = [
  {
    id: "cletus-corn-hole",
    label: "CLETUS' CORN HOLE",
    x: 0.38,
    y: 0.28,
    width: 0.16,
  },
  {
    id: "springfield-nuclear-power-plant",
    label: "SPRINGFIELD NUCLEAR POWER PLANT",
    x: 0.7,
    y: 0.25,
    width: 0.28,
    fontScale: 0.82,
  },
  {
    id: "kamp-krusty",
    label: "KAMP KRUSTY",
    // Right of town-square centre, a touch above Evergreen Terrace
    x: 0.55,
    y: 0.41,
    width: 0.13,
  },
  {
    id: "evergreen-terrace",
    label: "EVERGREEN TERRACE",
    x: 0.29,
    y: 0.44,
    width: 0.18,
  },
  {
    id: "burns-manor",
    label: "BURNS MANOR",
    x: 0.76,
    y: 0.49,
    width: 0.14,
  },
  {
    id: "springfield-town-square",
    label: "SPRINGFIELD TOWN SQUARE",
    x: 0.52,
    y: 0.58,
    width: 0.21,
    fontScale: 0.86,
  },
  {
    id: "springfield-slurpworks",
    label: "SPRINGFIELD SLURPWORKS",
    x: 0.24,
    y: 0.66,
    width: 0.22,
    fontScale: 0.84,
  },
  {
    id: "corruption-corners",
    label: "CORRUPTION CORNERS",
    x: 0.74,
    y: 0.66,
    width: 0.19,
  },
  {
    id: "donut-district",
    label: "DONUT DISTRICT",
    x: 0.39,
    y: 0.77,
    width: 0.14,
  },
];

export const SPRINGFIELD_POI_IDS = SPRINGFIELD_POIS.map((poi) => poi.id);

export const EXPECTED_SPRINGFIELD_POI_COUNT = 9;
