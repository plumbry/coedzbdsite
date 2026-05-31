import { Link } from "react-router-dom";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import {
  Trophy,
  TrendingUp,
  GitCompare,
  DollarSign,
  Swords,
  Target,
  BarChart3,
  Brain,
  LineChart,
  Database,
  FlaskConical,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";

const statsLinks = [
  {
    title: "Tier Re-Evaluation",
    description: "Review automatic tier promotion and demotion suggestions.",
    href: "/admin/tier-re-evaluation",
    icon: BarChart3,
  },
  {
    title: "Leaderboard Stats",
    description: "View top player rankings, TC & DCA scores, and overall leaderboard standings.",
    href: "/admin/leaderboard-stats",
    icon: Trophy,
  },
  {
    title: "Compare Players",
    description: "Side-by-side comparison of player performance metrics across events.",
    href: "/admin/player-comparison",
    icon: GitCompare,
  },
  {
    title: "Earnings",
    description: "Track player prize earnings from tournaments and events.",
    href: "/admin/player-earnings",
    icon: DollarSign,
  },
  {
    title: "In-Game Earnings",
    description: "Monitor in-game currency and reward earnings across all players.",
    href: "/admin/in-game-earnings",
    icon: TrendingUp,
  },
  {
    title: "Upset Kills",
    description: "Analyze lower-tier players eliminating higher-tier opponents.",
    href: "/admin/upset-kills",
    icon: Swords,
  },
  {
    title: "Tier Impact",
    description: "See how tier placement affects player performance over time.",
    href: "/admin/tier-impact",
    icon: Target,
  },
  {
    title: "Holistic Score Stats",
    description: "Deep dive into holistic score components and distributions.",
    href: "/admin/holistic-score-stats",
    icon: Brain,
  },
  {
    title: "Average Stats",
    description: "Tier and event averages across placement, kills, and win rate.",
    href: "/admin/average-stats",
    icon: LineChart,
  },
  {
    title: "Data Cache Status",
    description: "Monitor cache health and trigger rebuilds for stat pipelines.",
    href: "/admin/data-cache-status",
    icon: Database,
  },
  {
    title: "Tier Simulation",
    description: "Simulate tier changes and preview impact on rankings.",
    href: "/admin/tier-simulation",
    icon: FlaskConical,
  },
];

export default function StatsPage() {
  return (
    <AdminPageLayout requireAdmin
      title="Stats"
      description="Access all player and event statistics from one place."
      authTitle="Sign in to access stats"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {statsLinks.map((item) => (
          <Link key={item.href} to={item.href} className="block group">
            <Card className="h-full py-0 transition-colors group-hover:border-primary/50 cursor-pointer">
              <CardHeader className="py-3">
                <div className="flex items-center gap-3 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle>{item.title}</CardTitle>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </AdminPageLayout>
  );
}
