import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AdminLayout from "./components/admin-layout.tsx";
import UsernameSetupDialog from "./components/username-setup-dialog.tsx";
import Index from "./pages/Index.tsx";
import PlayerProfile from "./pages/player-profile/page.tsx";

import TierReEvaluation from "./pages/admin/tier-re-evaluation.tsx";
import AverageStats from "./pages/admin/average-stats.tsx";
import HolisticScoreStats from "./pages/admin/holistic-score-stats.tsx";
import TopFiveDetails from "./pages/admin/top-five-details.tsx";
import LeaderboardStats from "./pages/admin/leaderboard-stats.tsx";
import DataCacheStatus from "./pages/admin/data-cache-status.tsx";
import DataBackup from "./pages/admin/data-backup.tsx";
import UserManagementPage from "./pages/admin/user-management.tsx";
import DiscordMembersPage from "./pages/admin/discord-members.tsx";
import UnmatchedPlayers from "./pages/admin/_components/unmatched-players.tsx";
import YuniteTournamentDetails from "./pages/admin/yunite-tournament.tsx";
import EventsManagerPage from "./pages/admin/events-manager.tsx";
import SummerSlamAdminPage from "./pages/admin/summer-slam.tsx";
import EventResultsPage from "./pages/admin/event-results.tsx";
import UploadsPage from "./pages/admin/uploads.tsx";
import SupportAdminPage from "./pages/admin/support.tsx";
import AuditPage from "./pages/admin/audit.tsx";
import FeaturesPage from "./pages/admin/features/page.tsx";
import PlayerEarningsPage from "./pages/admin/player-earnings.tsx";
import MemberManagement from "./pages/admin/member-management.tsx";
import TierImpactPage from "./pages/admin/tier-impact.tsx";
import StatsPage from "./pages/admin/stats.tsx";
import AudienceInsightsPage from "./pages/admin/audience-insights.tsx";
import AudienceInsightsSegmentPage from "./pages/admin/audience-insights-segment.tsx";
import AdminHubPage from "./pages/admin/hub.tsx";
import DataMaintenancePage from "./pages/admin/data-maintenance.tsx";
import InGameEarningsPage from "./pages/admin/in-game-earnings.tsx";
import TierMismatchesPage from "./pages/admin/tier-mismatches.tsx";
import EventsPage from "./pages/events/page.tsx";
import EventDetail from "./pages/events/_components/event-detail.tsx";
import SupportPage from "./pages/support/page.tsx";
import ScrimsLandingPage from "./pages/scrims/page.tsx";
import ScrimEventPage from "./pages/scrims/event-page.tsx";
import ScrimSeriesLandingPage from "./pages/scrim-series/page.tsx";
import ScrimSeriesLeaderboardPage from "./pages/scrim-series/leaderboard.tsx";
import SummerSlamLandingPage from "./pages/summer-slam/page.tsx";
import SummerSlamPassportPage from "./pages/summer-slam/passport.tsx";
import SummerSlamPassportDemoPage from "./pages/summer-slam/passport-demo.tsx";
import TierRestrictionsPage from "./pages/tier-restrictions/page.tsx";
import SsoCallbackPage from "./pages/auth/sso-callback.tsx";

import EventBansPage from "./pages/admin/event-bans.tsx";
import PotentialEventCalendarPage from "./pages/admin/potential-event-calendar.tsx";
import ResourcesPage from "./pages/admin/resources.tsx";
import ScrimSeriesAdminPage from "./pages/admin/scrim-series.tsx";
import SpinModerationPage from "./pages/admin/spin-moderation.tsx";
import NotFound from "./pages/NotFound.tsx";
import { useServiceWorker } from "@/hooks/use-service-worker.ts";

export default function App() {
  useServiceWorker();
  return (
    <DefaultProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/player/:username" element={<PlayerProfile />} />

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminHubPage />} />
            <Route path="tier-re-evaluation" element={<TierReEvaluation />} />
            <Route path="average-stats" element={<AverageStats />} />
            <Route path="holistic-score-stats" element={<HolisticScoreStats />} />
            <Route path="top-five-details" element={<TopFiveDetails />} />
            <Route path="leaderboard-stats" element={<LeaderboardStats />} />
            <Route path="data-cache-status" element={<DataCacheStatus />} />
            <Route path="data-backup" element={<DataBackup />} />
            <Route path="data-maintenance" element={<DataMaintenancePage />} />
            <Route path="user-management" element={<UserManagementPage />} />
            <Route path="discord-members" element={<DiscordMembersPage />} />
            <Route path="unmatched/:importId" element={<UnmatchedPlayers />} />
            <Route path="yunite/:importId" element={<YuniteTournamentDetails />} />
            <Route path="yunite-debug" element={<Navigate to="/admin/uploads?tab=debug" replace />} />
            <Route path="events-manager" element={<EventsManagerPage />} />
            <Route path="summer-slam" element={<SummerSlamAdminPage />} />
            <Route path="event-results" element={<EventResultsPage />} />
            <Route path="uploads" element={<UploadsPage />} />
            <Route path="support" element={<SupportAdminPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="features" element={<FeaturesPage />} />
            <Route path="player-earnings" element={<PlayerEarningsPage />} />
            <Route path="member-management/:tab?" element={<MemberManagement />} />
            <Route path="members/:tab?" element={<MemberManagement />} />
            <Route path="tier-impact" element={<TierImpactPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route
              path="audience-insights/:chart/:segment"
              element={<AudienceInsightsSegmentPage />}
            />
            <Route path="audience-insights" element={<AudienceInsightsPage />} />
            <Route path="tier-mismatches" element={<TierMismatchesPage />} />
            <Route path="in-game-earnings" element={<InGameEarningsPage />} />
            <Route path="event-bans" element={<EventBansPage />} />
            <Route path="potential-event-calendar" element={<PotentialEventCalendarPage />} />
            <Route path="resources" element={<ResourcesPage />} />
            <Route path="punishment-matrix" element={<Navigate to="/admin/resources?tab=punishment-matrix" replace />} />
            <Route path="scrim-series" element={<ScrimSeriesAdminPage />} />
            <Route path="spin-moderation" element={<SpinModerationPage />} />
            <Route path="ops" element={<Navigate to="/admin/resources?tab=sponsors" replace />} />
          </Route>

          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:eventId" element={<EventDetail />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/spin" element={<ScrimsLandingPage />} />
          <Route path="/scrim-series" element={<ScrimSeriesLandingPage />} />
          <Route path="/scrim-series/:slug" element={<ScrimSeriesLeaderboardPage />} />
          <Route path="/summer-slam" element={<SummerSlamLandingPage />} />
          <Route path="/summer-slam/passport/demo" element={<SummerSlamPassportDemoPage />} />
          <Route path="/summer-slam/passport" element={<SummerSlamPassportPage />} />
          <Route path="/spin/:eventId" element={<ScrimEventPage />} />
          <Route path="/tier-restrictions" element={<TierRestrictionsPage />} />
          <Route path="/sso-callback" element={<SsoCallbackPage />} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <UsernameSetupDialog />
      </BrowserRouter>
    </DefaultProviders>
  );
}
