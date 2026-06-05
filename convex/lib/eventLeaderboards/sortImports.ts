import type { Doc } from "../../_generated/dataModel.d.ts";

/** Chronological order for multi-week events (Week 1, Week 2, …). */
export function sortEventImports(
  imports: Doc<"thirdPartyImports">[],
): Doc<"thirdPartyImports">[] {
  return [...imports].sort((a, b) => {
    if (a.eventDate && b.eventDate) {
      return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
    }
    return a._creationTime - b._creationTime;
  });
}
