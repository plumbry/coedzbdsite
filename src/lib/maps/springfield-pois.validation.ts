import {
  EXPECTED_SPRINGFIELD_POI_COUNT,
  SPRINGFIELD_POIS,
  type MapPoi,
} from "./springfield-pois";

function isUnitCoordinate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateSpringfieldPois(pois: MapPoi[]): void {
  if (pois.length !== EXPECTED_SPRINGFIELD_POI_COUNT) {
    throw new Error(`Expected ${EXPECTED_SPRINGFIELD_POI_COUNT} POIs, received ${pois.length}`);
  }

  const seenIds = new Set<string>();

  for (const poi of pois) {
    if (!poi.id || seenIds.has(poi.id)) {
      throw new Error(`Duplicate or missing POI id: ${poi.id}`);
    }
    seenIds.add(poi.id);

    if (!poi.label.trim()) {
      throw new Error(`POI ${poi.id} must have a label`);
    }

    if (!isUnitCoordinate(poi.x) || !isUnitCoordinate(poi.y)) {
      throw new Error(`POI ${poi.id} coordinates must be between 0 and 1`);
    }

    if (!Number.isFinite(poi.width) || poi.width <= 0) {
      throw new Error(`POI ${poi.id} width must be positive`);
    }

    if (poi.fontScale != null && (!Number.isFinite(poi.fontScale) || poi.fontScale <= 0)) {
      throw new Error(`POI ${poi.id} fontScale must be positive when provided`);
    }
  }
}

validateSpringfieldPois(SPRINGFIELD_POIS);
