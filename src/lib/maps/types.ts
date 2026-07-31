export type MapBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
};

export type SharedMap = {
  mapId: string;
  baseMapId: "simpsons-reload";
  boxes: MapBox[];
  createdAt: number;
  updatedAt: number;
};

export type SaveMapResult =
  | { ok: true; updatedAt: number; boxes: MapBox[] }
  | { ok: false; reason: "conflict"; serverUpdatedAt: number };
