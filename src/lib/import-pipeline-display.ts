export function importPipelineStatusVariant(
  status: string | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "outline";
  if (status === "Finalized") return "default";
  if (status === "Failed" || status === "Rate Limited") return "destructive";
  if (
    status === "Event Link Required" ||
    status === "Player Matching Required"
  ) {
    return "secondary";
  }
  return "outline";
}
