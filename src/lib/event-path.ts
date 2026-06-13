import type { Id } from "@/convex/_generated/dataModel.d.ts";

export function isConvexDocumentId(value: string): boolean {
  return /^[a-z0-9]{20,}$/i.test(value);
}

export function eventPublicPath(event: {
  _id: Id<"events">;
  slug?: string | null;
}): string {
  return `/events/${event.slug ?? event._id}`;
}
