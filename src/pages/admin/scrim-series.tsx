import { useSearchParams } from "react-router-dom";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import {
  ScrimSeriesAdminContent,
  type ScrimSeriesAdminTab,
} from "./_components/scrim-series-workspace.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const VALID_TABS = new Set<ScrimSeriesAdminTab>([
  "leaderboard",
  "scores",
  "yunite",
  "players",
  "penalties",
  "settings",
]);

function parseInitialTab(tab: string | null): ScrimSeriesAdminTab {
  if (tab && VALID_TABS.has(tab as ScrimSeriesAdminTab)) {
    return tab as ScrimSeriesAdminTab;
  }
  return "leaderboard";
}

export default function ScrimSeriesAdminPage() {
  const [searchParams] = useSearchParams();
  const seriesParam = searchParams.get("series");
  const initialSeriesId = seriesParam
    ? (seriesParam as Id<"scrimSeries">)
    : null;
  const initialTab = parseInitialTab(searchParams.get("tab"));

  return (
    <AdminPageLayout requireModerator title="Scrim Series Manager">
      <ScrimSeriesAdminContent
        initialSeriesId={initialSeriesId}
        initialTab={initialTab}
      />
    </AdminPageLayout>
  );
}
