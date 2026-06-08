export function isScrimLikeEventType(type: string): boolean {
  return type === "scrim" || type === "minicup";
}

export function getPublicEventTypeLabel(type: string): string {
  if (isScrimLikeEventType(type)) return "Scrim";
  if (type === "season") return "Season";
  if (type === "mini-season") return "Mini Season";
  if (type === "solos-meets-duos") return "Solos Meets Duos";
  if (type === "scrim-series") return "Scrim Series";
  if (type === "showdown") return "Showdown";
  return "Random";
}

export function matchesPublicEventTypeFilter(
  eventType: string,
  filter: string,
): boolean {
  if (filter === "all") return true;
  if (filter === "random") {
    return eventType === "random-squads" || eventType === "random-trios";
  }
  if (filter === "scrim") return isScrimLikeEventType(eventType);
  return eventType === filter;
}
