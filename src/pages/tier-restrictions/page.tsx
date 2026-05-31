import { Shield, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";
import { TierBadge } from "@/components/tier-badge.tsx";

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

function ComboRow({ combo }: { combo: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {combo.map((tier, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
          <TierBadge tier={tier} variant="square" />
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
        <CardTitle className="flex items-center gap-2">
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
    <PageShell>
      <PageHeader
        title="Tier Restrictions"
        icon={Shield}
        back={{ label: "Back to Members", href: "/" }}
        description="Teams must follow the allowed tier combinations below when registering for scrims. Each row shows a valid team composition based on player tiers."
      />

      <div className="flex flex-wrap gap-3">
        {Object.entries(TIER_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <TierBadge tier={key} variant="square" />
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4">
        <ModeCard
          title="Duos"
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          teamSize={2}
          combos={DUOS_COMBOS}
        />
        <ModeCard
          title="Trios"
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          teamSize={3}
          combos={TRIOS_COMBOS}
        />
        <ModeCard
          title="Squads"
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          teamSize={4}
          combos={SQUADS_COMBOS}
        />
      </div>
    </PageShell>
  );
}
