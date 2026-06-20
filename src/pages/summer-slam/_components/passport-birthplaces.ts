export const PASSPORT_BIRTHPLACE_IDS = [
  "paradise_palms",
  "sunny_steps",
  "sweaty_sands",
  "coral_castle",
  "lazy_lagoon",
  "heatwave_harbor",
  "sunken_shores",
  "rave_cave",
  "cluster_coast",
] as const;

export type PassportBirthplaceId = (typeof PASSPORT_BIRTHPLACE_IDS)[number];

export type PassportBirthplace = {
  id: PassportBirthplaceId;
  label: string;
};

export const PASSPORT_BIRTHPLACES: PassportBirthplace[] = [
  { id: "paradise_palms", label: "Paradise Palms" },
  { id: "sunny_steps", label: "Sunny Steps" },
  { id: "sweaty_sands", label: "Sweaty Sands" },
  { id: "coral_castle", label: "Coral Castle" },
  { id: "lazy_lagoon", label: "Lazy Lagoon" },
  { id: "heatwave_harbor", label: "Heatwave Harbor" },
  { id: "sunken_shores", label: "Sunken Shores" },
  { id: "rave_cave", label: "Rave Cave" },
  { id: "cluster_coast", label: "Cluster Coast" },
];

const birthplaceById = new Map(PASSPORT_BIRTHPLACES.map((place) => [place.id, place]));

export function getPassportBirthplace(birthplaceId: PassportBirthplaceId | null | undefined) {
  if (!birthplaceId) return null;
  return birthplaceById.get(birthplaceId) ?? null;
}

export function getPassportBirthplaceLabel(birthplaceId: PassportBirthplaceId | null | undefined) {
  return getPassportBirthplace(birthplaceId)?.label ?? null;
}
