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
 * Centres sit on the landmark buildings (arrow targets), not the left-offset
 * gutter text from the labelled reference screenshot.
 */
export const SPRINGFIELD_POIS: MapPoi[] = [
  {
    id: "cletus-corn-hole",
    label: "CLETUS' CORN HOLE",
    // NW farm buildings / crop fields
    x: 0.33,
    y: 0.27,
    width: 0.16,
  },
  {
    id: "springfield-nuclear-power-plant",
    label: "SPRINGFIELD NUCLEAR POWER PLANT",
    // NE cooling-tower plant complex
    x: 0.78,
    y: 0.22,
    width: 0.28,
    fontScale: 0.82,
  },
  {
    id: "kamp-krusty",
    label: "KAMP KRUSTY",
    // Island in the north lake
    x: 0.49,
    y: 0.29,
    width: 0.13,
  },
  {
    id: "evergreen-terrace",
    label: "EVERGREEN TERRACE",
    // Western residential street grid
    x: 0.24,
    y: 0.48,
    width: 0.18,
  },
  {
    id: "burns-manor",
    label: "BURNS MANOR",
    // Eastern white mansion + formal gardens
    x: 0.8,
    y: 0.49,
    width: 0.14,
  },
  {
    id: "springfield-town-square",
    label: "SPRINGFIELD TOWN SQUARE",
    // Central urban plaza / building cluster
    x: 0.53,
    y: 0.55,
    width: 0.21,
    fontScale: 0.86,
  },
  {
    id: "springfield-slurpworks",
    label: "SPRINGFIELD SLURPWORKS",
    // SW coastal industrial complex
    x: 0.23,
    y: 0.73,
    width: 0.22,
    fontScale: 0.84,
  },
  {
    id: "corruption-corners",
    label: "CORRUPTION CORNERS",
    // SE coastal built-up area
    x: 0.78,
    y: 0.76,
    width: 0.19,
  },
  {
    id: "donut-district",
    label: "DONUT DISTRICT",
    // Southern coastal town cluster
    x: 0.48,
    y: 0.8,
    width: 0.14,
  },
];

export const SPRINGFIELD_POI_IDS = SPRINGFIELD_POIS.map((poi) => poi.id);

export const EXPECTED_SPRINGFIELD_POI_COUNT = 9;
