export const BASE_MAP_ID = "simpsons-reload" as const;

/** Static asset served from public/. */
export const BASE_MAP_IMAGE_PATH = "/assets/maps/springfield-reload-map.webp";

/** Native pixel dimensions of springfield-reload-map.webp (square). */
export const BASE_MAP_IMAGE_SIZE = { width: 1000, height: 1000 } as const;

export const MAP_BOX_MIN_SIZE = 0.01;
export const MAP_BOX_LABEL_MAX_LENGTH = 100;
export const MAP_BOX_DEFAULT_MIN_DRAG_SIZE = 0.02;
export const MAP_BOX_DEFAULT_COLOR = "#3B82F6";
export const MAP_CREATE_DRAG_THRESHOLD_PX = 4;

export const BASE_MAPS = {
  [BASE_MAP_ID]: {
    label: "Simpsons Reload",
    imagePath: BASE_MAP_IMAGE_PATH,
  },
} as const;
