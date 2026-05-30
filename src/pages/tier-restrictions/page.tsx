import SiteHeader from "@/components/site-header.tsx";
import { Shield, Users, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Link } from "react-router-dom";

const TIER_COLORS: Record<string, string> = {
  S: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  A: "bg-red-500/20 text-red-400 border-red-500/40",
  B: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  C: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
};

const TIER_LABELS: Record<string, string> = {
  S: "S Tier",
  A: "A Tier",
  B: "B Tier",
  C: "C Tier",
};

const DUOS_COMBOS = [
  ["S", "C"],
  ["A", "B"],
  ["A", "C"],
  ["B", "B"],
  ["B", "C"],
  ["C", "C"],
];

const TRIOS_COMBOS = [
  ["S", "B", "C"],
  ["S", "C", "C"],
  ["A", "A", "C"],
  ["A", "B", "B"],
  ["A", "B", "C"],
  ["A", "C", "C"],
  ["B", "B", "B"],
  ["B", "B", "C"],
  ["B", "C", "C"],
  ["C", "C", "C"],
];

const SQUADS_COMBOS = [
  ["S", "B", "C", "C"],
  ["S", "C", "C", "C"],
  ["A", "A", "C", "C"],
  ["A", "B", "B", "C"],
  ["A", "B", "C", "C"],
  ["A", "C", "C", "C"],
  ["B", "B", "B", "B"],
  ["B", "B", "B", "C"],
  ["B", "B", "C", "C"],
  ["B", "C", "C", "C"],
  ["C", "C", "C", "C"],
];

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 rounded-md border font-bold text-sm ${TIER_COLORS[tier] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {tier}
    </span>
  );
}

function ComboRow({ combo }: { combo: string[] }) {
  return (
    <div className="flex items-center gap-2">
      {combo.map((tier, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
          <TierBadge tier={tier} />
        </span>
      ))}
    </div>
  );
}

function ModeCard({
  title,
  icon,
  teamSize,
  combos,
}: {
  title: string;
  icon: React.ReactNode;
  teamSize: number;
  combos: string[][];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-lg">
          {icon}
          <span>{title}</span>
          <Badge variant="secondary" className="ml-auto font-normal">
            {combos.length} combinations
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {teamSize} players per team
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {combos.map((combo, i) => (
            <ComboRow key={i} combo={combo} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TierRestrictionsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Players
        </Link>

        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Tier Restrictions
            </h1>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Teams must follow the allowed tier combinations below when
            registering for scrims. Each row shows a valid team composition
            based on player tiers.
          </p>
        </div>

        {/* Tier legend */}
        <div className="flex flex-wrap gap-3 mb-8">
          {Object.entries(TIER_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <TierBadge tier={key} />
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        {/* Mode cards */}
        <div className="grid gap-6">
          <ModeCard
            title="Duos"
            icon={<Users className="h-5 w-5 text-muted-foreground" />}
            teamSize={2}
            combos={DUOS_COMBOS}
          />
          <ModeCard
            title="Trios"
            icon={<Users className="h-5 w-5 text-muted-foreground" />}
            teamSize={3}
            combos={TRIOS_COMBOS}
          />
          <ModeCard
            title="Squads"
            icon={<Users className="h-5 w-5 text-muted-foreground" />}
            teamSize={4}
            combos={SQUADS_COMBOS}
          />
        </div>
      </div>
    </div>
  );
}
