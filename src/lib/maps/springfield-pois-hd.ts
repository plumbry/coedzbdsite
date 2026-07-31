import { SPRINGFIELD_POIS, type MapPoi } from "./springfield-pois";

/**
 * Admin editor defaults — kept in sync with the public POI list.
 */
export const SPRINGFIELD_POIS_HD: MapPoi[] = SPRINGFIELD_POIS.map((poi) => ({
  ...poi,
}));

export function serializePoisAsTypeScript(pois: MapPoi[]): string {
  const body = pois
    .map((poi) => {
      const font =
        poi.fontScale != null ? `,\n    fontScale: ${poi.fontScale},` : ",";
      return `  {
    id: ${JSON.stringify(poi.id)},
    label: ${JSON.stringify(poi.label)},
    x: ${Number(poi.x.toFixed(4))},
    y: ${Number(poi.y.toFixed(4))},
    width: ${Number(poi.width.toFixed(4))}${font}
  }`;
    })
    .join(",\n");

  return `export const SPRINGFIELD_POIS: MapPoi[] = [\n${body},\n];\n`;
}
