import { Link } from "react-router-dom";
import AdminSidebar from "./_components/admin-sidebar.tsx";
import { Trophy, TrendingUp, GitCompare, DollarSign, Swords, Target } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";

const statsLinks = [
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
];

export default function StatsPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 p-4 md:p-8 pt-16 lg:pt-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Stats</h1>
            <p className="text-muted-foreground mt-1">
              Access all player and event statistics from one place.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {statsLinks.map((item) => (
              <Link key={item.href} to={item.href} className="block group">
                <Card className="h-full transition-colors group-hover:border-primary/50 cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-base">{item.title}</CardTitle>
                    </div>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
