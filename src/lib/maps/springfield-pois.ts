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
    x: 0.225,
    y: 0.195,
    width: 0.155,
  },
  {
    id: "springfield-nuclear-power-plant",
    label: "SPRINGFIELD NUCLEAR POWER PLANT",
    x: 0.775,
    y: 0.165,
    width: 0.27,
    fontScale: 0.84,
  },
  {
    id: "kamp-krusty",
    label: "KAMP KRUSTY",
    x: 0.515,
    y: 0.275,
    width: 0.125,
  },
  {
    id: "evergreen-terrace",
    label: "EVERGREEN TERRACE",
    x: 0.215,
    y: 0.415,
    width: 0.175,
  },
  {
    id: "burns-manor",
    label: "BURNS MANOR",
    x: 0.775,
    y: 0.435,
    width: 0.135,
  },
  {
    id: "springfield-town-square",
    label: "SPRINGFIELD TOWN SQUARE",
    x: 0.495,
    y: 0.515,
    width: 0.205,
    fontScale: 0.87,
  },
  {
    id: "springfield-slurpworks",
    label: "SPRINGFIELD SLURPWORKS",
    x: 0.195,
    y: 0.655,
    width: 0.215,
    fontScale: 0.85,
  },
  {
    id: "corruption-corners",
    label: "CORRUPTION CORNERS",
    x: 0.725,
    y: 0.725,
    width: 0.185,
  },
  {
    id: "donut-district",
    label: "DONUT DISTRICT",
    x: 0.435,
    y: 0.765,
    width: 0.135,
  },
];

export const SPRINGFIELD_POI_IDS = SPRINGFIELD_POIS.map((poi) => poi.id);

export const EXPECTED_SPRINGFIELD_POI_COUNT = 9;
