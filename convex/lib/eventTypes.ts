import type { Doc } from "../_generated/dataModel.d.ts";

type EventType = Doc<"events">["type"];

/** Legacy `minicup` rows are treated as scrims everywhere new code runs. */
export function normalizeEventType(type: EventType): EventType {
  return type === "minicup" ? "scrim" : type;
}

export function isScrimLikeEventType(type: string): boolean {
  return type === "scrim" || type === "minicup";
}
