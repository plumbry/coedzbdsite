import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Shield, Trophy, Users } from "lucide-react";
import PageShell from "@/components/page-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

const featureCards = [
  {
    title: "Member Directory",
    description: "Find ZBD players, tiers, activity status, and public competitive profiles.",
    href: "/members",
    cta: "View members",
    icon: Users,
  },
  {
    title: "Events",
    description: "Track upcoming and active community tournaments, seasons, and scrims.",
    href: "/events",
    cta: "See events",
    icon: CalendarDays,
  },
  {
    title: "Tier Rules",
    description: "Check valid duos, trios, and squads combinations before you register.",
    href: "/tier-restrictions",
    cta: "Review tiers",
    icon: Shield,
  },
] as const;

export default function LandingPage() {
  return (
    <PageShell>
      <section className="overflow-hidden rounded-3xl border bg-card">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:p-10">
          <div className="flex flex-col justify-center gap-6">
            <div className="space-y-4">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Trophy className="h-3.5 w-3.5 text-primary" />
                Zero Build community
              </div>
              <div className="space-y-3">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                  Competitive Fortnite for the COED ZBD community.
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                  Find events, check tier rules, and connect with the players who make up
                  the COED ZBD competitive scene.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/members">
                  Browse Members
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/events">View Events</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-background/70 p-5 shadow-sm">
            <div className="space-y-4">
              <div className="rounded-xl bg-primary/10 p-4">
                <p className="text-sm font-medium text-primary">Use creator code</p>
                <p className="mt-1 text-3xl font-bold tracking-tight">coedzbd</p>
                <p className="mt-2 text-xs text-muted-foreground">#ad</p>
              </div>
              <div className="grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Public member list now lives at /members
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Events, seasons, and scrims in one place
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Team tier restrictions for fair lobbies
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {featureCards.map((card) => (
          <Card key={card.href} className="transition-colors hover:border-primary/60">
            <CardHeader>
              <card.icon className="h-5 w-5 text-primary" />
              <CardTitle>{card.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-muted-foreground">{card.description}</p>
              <Button asChild variant="link" className="h-auto justify-start p-0">
                <Link to={card.href}>
                  {card.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </PageShell>
  );
}
