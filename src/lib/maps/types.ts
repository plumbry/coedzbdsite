export type MapBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** @deprecated Prefer MapText objects. Kept for schema compatibility. */
  label: string;
  color: string;
};

export type MapText = {
  id: string;
  /** Centre x, 0–1. */
  x: number;
  /** Centre y, 0–1. */
  y: number;
  text: string;
  color: string;
};

export type MapPolygonPoint = {
  x: number;
  y: number;
};

export type MapPolygon = {
  id: string;
  /** Closed polygon vertices in normalized 0–1 map space (≥3). */
  points: MapPolygonPoint[];
  color: string;
};

/** One nullable object reference — never a layer-wide selection. */
export type SelectedObject =
  | { type: "box"; id: string }
  | { type: "text"; id: string }
  | { type: "polygon"; id: string }
  | null;

/** @deprecated Prefer SelectedObject */
export type MapSelection = SelectedObject;

export type EditorTool = "select" | "rect" | "text" | "polygon";

export type SharedMap = {
  mapId: string;
  baseMapId: "simpsons-reload";
  boxes: MapBox[];
  texts: MapText[];
  polygons: MapPolygon[];
  createdAt: number;
  updatedAt: number;
};

export type SaveMapResult = {
  ok: true;
  mapId: string;
  updatedAt: number;
  boxes: MapBox[];
  texts: MapText[];
  polygons: MapPolygon[];
};
