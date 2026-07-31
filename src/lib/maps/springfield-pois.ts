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
 * Normalized POI label centres for the Springfield Reload map asset (2400×2400).
 * Tuned in /admin/maps against springfield-reload-map-2400.png.
 */
export const SPRINGFIELD_POIS: MapPoi[] = [
  {
    id: "cletus-corn-hole",
    label: "CLETUS' CORN HOLE",
    x: 0.3054,
    y: 0.2081,
    width: 0.16,
  },
  {
    id: "springfield-nuclear-power-plant",
    label: "SPRINGFIELD NUCLEAR POWER PLANT",
    x: 0.7306,
    y: 0.2167,
    width: 0.28,
    fontScale: 0.82,
  },
  {
    id: "kamp-krusty",
    label: "KAMP KRUSTY",
    x: 0.5593,
    y: 0.3288,
    width: 0.13,
  },
  {
    id: "evergreen-terrace",
    label: "EVERGREEN TERRACE",
    x: 0.1955,
    y: 0.4094,
    width: 0.18,
  },
  {
    id: "burns-manor",
    label: "BURNS MANOR",
    x: 0.772,
    y: 0.4727,
    width: 0.14,
  },
  {
    id: "springfield-town-square",
    label: "SPRINGFIELD TOWN SQUARE",
    x: 0.4707,
    y: 0.5893,
    width: 0.21,
    fontScale: 0.86,
  },
  {
    id: "springfield-slurpworks",
    label: "SPRINGFIELD SLURPWORKS",
    x: 0.1188,
    y: 0.6946,
    width: 0.22,
    fontScale: 0.84,
  },
  {
    id: "corruption-corners",
    label: "CORRUPTION CORNERS",
    x: 0.772,
    y: 0.6906,
    width: 0.19,
  },
  {
    id: "donut-district",
    label: "DONUT DISTRICT",
    x: 0.3381,
    y: 0.8259,
    width: 0.14,
  },
];

export const SPRINGFIELD_POI_IDS = SPRINGFIELD_POIS.map((poi) => poi.id);

export const EXPECTED_SPRINGFIELD_POI_COUNT = 9;
