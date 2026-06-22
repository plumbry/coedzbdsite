import { Link } from "react-router-dom";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import {
  Trophy,
  TrendingUp,
  DollarSign,
  Target,
  Brain,
  LineChart,
  Database,
  Wrench,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";

type StatsLink = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  analyticsVisible?: boolean;
};

type StatsSection = {
  title: string;
  description: string;
  links: StatsLink[];
  analyticsVisible?: boolean;
};

const statsSections: StatsSection[] = [
  {
    title: "Tier & holistic",
    description: "Promotion/demotion signals and holistic score components.",
    links: [
      {
        title: "Tier Re-Evaluation",
        description: "Review automatic tier promotion and demotion suggestions.",
        href: "/admin/tier-re-evaluation",
        icon: TrendingUp,
      },
      {
        title: "Holistic Score Stats",
        description: "Component breakdowns and distributions from the tier-eval cache.",
        href: "/admin/holistic-score-stats",
        icon: Brain,
      },
      {
        title: "Tier Impact",
        description: "How tier placement affects performance over time.",
        href: "/admin/tier-impact",
        icon: Target,
      },
    ],
  },
  {
    title: "Population & events",
    description: "Member mix, event participation, and audience trends.",
    analyticsVisible: true,
    links: [
      {
        title: "Audience Insights",
        description: "Gender, tier, tenure, application source, and events-played donut charts.",
        href: "/admin/audience-insights",
        icon: Users,
        analyticsVisible: true,
      },
      {
        title: "Average Stats",
        description: "Population placement, kills, and win-rate averages by tier.",
        href: "/admin/average-stats",
        icon: LineChart,
      },
      {
        title: "Leaderboard Stats",
        description: "Event leaderboard participation and top-finisher rates.",
        href: "/admin/leaderboard-stats",
        icon: Trophy,
      },
    ],
  },
  {
    title: "Earnings",
    description: "Tournament and in-game prize earnings.",
    links: [
      {
        title: "Earnings",
        description: "Tournament and event prize earnings by player.",
        href: "/admin/player-earnings",
        icon: DollarSign,
      },
      {
        title: "In-Game Earnings",
        description: "In-game currency and reward earnings.",
        href: "/admin/in-game-earnings",
        icon: TrendingUp,
      },
    ],
  },
  {
    title: "Caches & rebuilds",
    description: "Unified player-stats pipeline health and one-time migrations.",
    links: [
      {
        title: "Data Cache",
        description: "Cache coverage, live rebuild progress, and partial rebuild shortcuts.",
        href: "/admin/data-cache-status",
        icon: Database,
      },
      {
        title: "Data Maintenance",
        description: "PR field cleanup, full rebuild, migrations, and destructive tools.",
        href: "/admin/data-maintenance",
        icon: Wrench,
      },
    ],
  },
];

function StatsSectionGrid({ section }: { section: StatsSection }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {section.title}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {section.links.map((item) => (
          <Link key={item.href} to={item.href} className="block group">
            <Card className="h-full py-0 transition-colors group-hover:border-primary/50 cursor-pointer">
              <CardHeader className="py-3">
                <div className="flex items-center gap-3 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </div>
                <CardDescription className="text-xs">{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

function filterSectionsForAnalytics(sections: StatsSection[]): StatsSection[] {
  return sections
    .filter((section) => section.analyticsVisible)
    .map((section) => ({
      ...section,
      links: section.links.filter((link) => link.analyticsVisible),
    }))
    .filter((section) => section.links.length > 0);
}

export default function StatsPage() {
  const { isAnalytics, isAdmin } = useUserRole();
  const visibleSections =
    isAnalytics && !isAdmin ? filterSectionsForAnalytics(statsSections) : statsSections;

  return (
    <AdminPageLayout
      requireAnalyticsHub
      title="Analytics Hub"
      description={
        isAnalytics && !isAdmin
          ? "Audience insights for analytics staff."
          : "Tier evaluation, holistic scores, earnings, and unified stat rebuilds."
      }
      authTitle="Sign in to access analytics"
    >
      <div className="space-y-8">
        {visibleSections.map((section) => (
          <StatsSectionGrid key={section.title} section={section} />
        ))}
      </div>
    </AdminPageLayout>
  );
}
