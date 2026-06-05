import type { Id } from "@/convex/_generated/dataModel.d.ts";
import type { ScrimSeriesAdminTab } from "@/pages/admin/_components/scrim-series-workspace.tsx";

/** Deep link into Admin → Scrim Series with series (and optional tab) pre-selected. */
export function scrimSeriesAdminPath(
  seriesId: Id<"scrimSeries">,
  tab?: ScrimSeriesAdminTab,
): string {
  const params = new URLSearchParams({ series: seriesId });
  if (tab) {
    params.set("tab", tab);
  }
  return `/admin/scrim-series?${params.toString()}`;
}
