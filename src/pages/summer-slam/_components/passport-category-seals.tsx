/**
 * Summer Slam category seal system — silhouette-first identity marks.
 *
 * Concept (5 distinct silhouettes, one family):
 * - Traveller: compass rose (journey / modes)
 * - Competitor: trophy cup (placement / wins)
 * - Summer Spirit: sun burst (vibes / moments)
 * - Team Player: trio nodes (squad / formats)
 * - Community: heart crest (Discord / events)
 *
 * States (readable without text):
 * - empty / open: ghost outline on paper
 * - in_progress: outline + inner progress hint
 * - pending: dashed ring (submitted, awaiting staff)
 * - needs_fix: ring with gap notch (staff returned)
 * - earned: solid ink fill + slight rotation
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";
import {
  getQuestStatus,
  type QuestCategory,
  type QuestEntry,
  type QuestStatus,
} from "./passport-types.ts";

export type SealVisualState = "empty" | "open" | "in_progress" | "pending" | "needs_fix" | "earned";

const SLOT_ROTATIONS = [-7, 5, -4] as const;

export const SEAL_CONCEPTS: Array<{
  id: QuestCategory;
  name: string;
  motif: string;
  silhouette: string;
}> = [
  {
    id: "traveller",
    name: "Traveller Seal",
    motif: "Compass rose",
    silhouette: "Four-point compass with north chevron — journey across modes",
  },
  {
    id: "competitor",
    name: "Competitor Seal",
    motif: "Laurel trophy",
    silhouette: "Cup with handles and base — placement and wins",
  },
  {
    id: "summer_spirit",
    name: "Summer Spirit Seal",
    motif: "Sun burst",
    silhouette: "Central disc with eight rays — seasonal moments",
  },
  {
    id: "team_player",
    name: "Team Player Seal",
    motif: "Squad triad",
    silhouette: "Three linked nodes — duos, trios, squads",
  },
  {
    id: "community",
    name: "Community Seal",
    motif: "Heart crest",
    silhouette: "Shield heart — Discord community participation",
  },
];

export function getSlotRotation(slotIndex: number) {
  return SLOT_ROTATIONS[slotIndex % SLOT_ROTATIONS.length];
}

export function resolveSealVisualState(entry: QuestEntry | null): SealVisualState {
  if (!entry) return "empty";
  const status = getQuestStatus(entry);
  if (status === "approved") return "earned";
  if (status === "pending_review") return "pending";
  if (status === "rejected" || status === "needs_more_evidence") return "needs_fix";
  if (status === "in_progress") return "in_progress";
  return "open";
}

function TravellerGlyph() {
  return (
    <>
      <path d="M32 12 L34 28 L32 26 L30 28 Z" fill="currentColor" />
      <path d="M32 36 L34 20 L32 22 L30 20 Z" fill="currentColor" opacity="0.45" />
      <path d="M18 32 L34 30 L32 32 L34 34 Z" fill="currentColor" opacity="0.45" />
      <path d="M46 32 L30 34 L32 32 L30 30 Z" fill="currentColor" opacity="0.45" />
      <circle cx="32" cy="32" r="3.5" fill="currentColor" />
    </>
  );
}

function CompetitorGlyph() {
  return (
    <>
      <path
        d="M24 22 C24 18 28 16 32 16 C36 16 40 18 40 22 L40 26 L24 26 Z"
        fill="currentColor"
      />
      <path d="M22 26 L42 26 L40 34 L24 34 Z" fill="currentColor" />
      <path d="M26 34 L38 34 L36 40 L28 40 Z" fill="currentColor" />
      <path d="M28 40 L36 40 L34 44 L30 44 Z" fill="currentColor" opacity="0.7" />
      <path
        d="M20 24 C18 22 18 20 20 19 L22 22 Z M44 24 C46 22 46 20 44 19 L42 22 Z"
        fill="currentColor"
        opacity="0.55"
      />
    </>
  );
}

function SummerSpiritGlyph() {
  return (
    <>
      <circle cx="32" cy="32" r="7" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="32"
          y1="32"
          x2={32 + 14 * Math.cos((deg * Math.PI) / 180)}
          y2={32 + 14 * Math.sin((deg * Math.PI) / 180)}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

function TeamPlayerGlyph() {
  return (
    <>
      <circle cx="32" cy="22" r="5" fill="currentColor" />
      <circle cx="22" cy="40" r="5" fill="currentColor" />
      <circle cx="42" cy="40" r="5" fill="currentColor" />
      <path
        d="M32 27 L22 35 M32 27 L42 35 M26 38 L38 38"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
    </>
  );
}

function CommunityGlyph() {
  return (
    <>
      <path
        d="M32 18 C26 18 22 24 22 30 C22 38 32 46 32 46 C32 46 42 38 42 30 C42 24 38 18 32 18 Z"
        fill="currentColor"
      />
      <path
        d="M32 24 C29 24 27 27 27 30 C27 34 32 39 32 39 C32 39 37 34 37 30 C37 27 35 24 32 24 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.35"
      />
    </>
  );
}

const GLYPHS: Record<QuestCategory, () => ReactNode> = {
  traveller: TravellerGlyph,
  competitor: CompetitorGlyph,
  summer_spirit: SummerSpiritGlyph,
  team_player: TeamPlayerGlyph,
  community: CommunityGlyph,
};

export function CategorySeal({
  categoryId,
  state,
  slotIndex = 0,
  className,
  size = 44,
}: {
  categoryId: QuestCategory | string;
  state: SealVisualState;
  slotIndex?: number;
  className?: string;
  size?: number;
}) {
  const category = (categoryId in GLYPHS ? categoryId : "traveller") as QuestCategory;
  const Glyph = GLYPHS[category];
  const rotation = state === "earned" ? getSlotRotation(slotIndex) : 0;
  const earned = state === "earned";
  const ghost = state === "empty" || state === "open";
  const pending = state === "pending";
  const needsFix = state === "needs_fix";

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn(
        "shrink-0",
        earned && "text-slate-900",
        ghost && "text-slate-400",
        pending && "text-amber-700",
        needsFix && "text-red-700",
        state === "in_progress" && "text-slate-600",
        className,
      )}
      style={{ transform: `rotate(${rotation}deg)` }}
      aria-hidden
    >
      <circle
        cx="32"
        cy="32"
        r="28"
        fill={earned ? "currentColor" : "none"}
        fillOpacity={earned ? 0.12 : 0}
        stroke="currentColor"
        strokeWidth={earned ? 2.5 : 2}
        strokeDasharray={pending ? "5 3" : needsFix ? "36 8" : undefined}
        opacity={ghost ? 0.45 : 1}
      />
      <g
        opacity={ghost ? 0.35 : earned ? 1 : 0.85}
        style={{ color: earned ? "inherit" : "currentColor" }}
      >
        <Glyph />
      </g>
      {state === "in_progress" ? (
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="44 132"
          strokeLinecap="round"
          opacity="0.5"
        />
      ) : null}
    </svg>
  );
}

export function CategorySealFromEntry({
  entry,
  categoryId,
  slotIndex,
  className,
  size,
}: {
  entry: QuestEntry | null;
  categoryId: QuestCategory | string;
  slotIndex: number;
  className?: string;
  size?: number;
}) {
  return (
    <CategorySeal
      categoryId={categoryId}
      state={resolveSealVisualState(entry)}
      slotIndex={slotIndex}
      className={className}
      size={size}
    />
  );
}

/** Dev / demo: all five seals in every state */
export function CategorySealConceptGrid() {
  const states: SealVisualState[] = [
    "empty",
    "open",
    "in_progress",
    "pending",
    "needs_fix",
    "earned",
  ];

  return (
    <div className="space-y-4">
      {SEAL_CONCEPTS.map((concept) => (
        <div key={concept.id}>
          <p className="text-xs font-bold text-slate-800">{concept.name}</p>
          <p className="text-[10px] text-slate-500">
            {concept.motif} — {concept.silhouette}
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {states.map((state) => (
              <div key={state} className="flex flex-col items-center gap-1">
                <CategorySeal categoryId={concept.id} state={state} slotIndex={1} size={40} />
                <span className="text-[9px] uppercase text-slate-500">{state}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function indexStatusLabel(status: QuestStatus) {
  switch (status) {
    case "approved":
      return "Earned";
    case "pending_review":
      return "In review";
    case "rejected":
      return "Rejected";
    case "needs_more_evidence":
      return "Needs fix";
    case "in_progress":
      return "In progress";
    default:
      return "Open";
  }
}
