import type { QuestCategory } from "./passport-types.ts";
import { SEAL_ORDER } from "./passport-seal.ts";

export type SeasonDestination = {
  id: QuestCategory;
  name: string;
  subtitle: string;
  /** Warm accent for route nodes and stamps */
  accent: string;
  tint: string;
};

/** Each seal category maps to a seasonal stop on the passport journey. */
export const SEASON_DESTINATIONS: Record<QuestCategory, SeasonDestination> = {
  traveller: {
    id: "traveller",
    name: "Sunset Shores",
    subtitle: "Where your summer journey begins",
    accent: "#f97316",
    tint: "#fff7ed",
  },
  competitor: {
    id: "competitor",
    name: "Coral Coast",
    subtitle: "Prove yourself in the heat of competition",
    accent: "#fb7185",
    tint: "#fff1f2",
  },
  summer_spirit: {
    id: "summer_spirit",
    name: "Palm Bay",
    subtitle: "Soak up the season and share the vibes",
    accent: "#14b8a6",
    tint: "#f0fdfa",
  },
  team_player: {
    id: "team_player",
    name: "Adventure Point",
    subtitle: "Squad up and conquer together",
    accent: "#38bdf8",
    tint: "#f0f9ff",
  },
  community: {
    id: "community",
    name: "Summer Finale",
    subtitle: "The final stop — community glory awaits",
    accent: "#a855f7",
    tint: "#faf5ff",
  },
};

export const DESTINATION_ORDER = SEAL_ORDER.map((id) => SEASON_DESTINATIONS[id]);

export function getDestination(category: QuestCategory): SeasonDestination {
  return SEASON_DESTINATIONS[category];
}

export function getNextDestination(currentId: QuestCategory | null): SeasonDestination | null {
  if (!currentId) return DESTINATION_ORDER[0] ?? null;
  const index = SEAL_ORDER.indexOf(currentId);
  if (index < 0 || index >= SEAL_ORDER.length - 1) return null;
  return SEASON_DESTINATIONS[SEAL_ORDER[index + 1]!];
}

export const SEASON_REWARDS = [
  {
    id: "passport",
    title: "Full Passport",
    description:
      "Complete all five stamps to unlock the Bonus Stamp. You will also receive a certificate and exclusive Discord Role!",
    icon: "passport" as const,
  },
];
