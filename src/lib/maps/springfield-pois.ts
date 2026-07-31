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
 * Positions target the POI buildings themselves (not ocean gutter text).
 */
export const SPRINGFIELD_POIS: MapPoi[] = [
  {
    id: "cletus-corn-hole",
    label: "CLETUS' CORN HOLE",
    // NW farm buildings / crop fields
    x: 0.3,
    y: 0.24,
    width: 0.16,
  },
  {
    id: "springfield-nuclear-power-plant",
    label: "SPRINGFIELD NUCLEAR POWER PLANT",
    // NE cooling-tower plant complex
    x: 0.72,
    y: 0.23,
    width: 0.28,
    fontScale: 0.82,
  },
  {
    id: "kamp-krusty",
    label: "KAMP KRUSTY",
    // Forest cabin cluster west/south of the north lake
    x: 0.5,
    y: 0.33,
    width: 0.13,
  },
  {
    id: "evergreen-terrace",
    label: "EVERGREEN TERRACE",
    // Western residential street grid
    x: 0.26,
    y: 0.46,
    width: 0.18,
  },
  {
    id: "burns-manor",
    label: "BURNS MANOR",
    // Eastern white mansion (not the hedge maze)
    x: 0.74,
    y: 0.5,
    width: 0.14,
  },
  {
    id: "springfield-town-square",
    label: "SPRINGFIELD TOWN SQUARE",
    // Central town green / plaza
    x: 0.5,
    y: 0.56,
    width: 0.21,
    fontScale: 0.86,
  },
  {
    id: "springfield-slurpworks",
    label: "SPRINGFIELD SLURPWORKS",
    // SW coastal industrial complex
    x: 0.24,
    y: 0.7,
    width: 0.22,
    fontScale: 0.84,
  },
  {
    id: "corruption-corners",
    label: "CORRUPTION CORNERS",
    // SE coastal built-up area
    x: 0.74,
    y: 0.72,
    width: 0.19,
  },
  {
    id: "donut-district",
    label: "DONUT DISTRICT",
    // Southern coastal town cluster (left of the small southern islet)
    x: 0.42,
    y: 0.76,
    width: 0.14,
  },
];

export const SPRINGFIELD_POI_IDS = SPRINGFIELD_POIS.map((poi) => poi.id);

export const EXPECTED_SPRINGFIELD_POI_COUNT = 9;
