import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import PageShell from "@/components/page-shell.tsx";

const HOME_LINKS = [
  {
    to: "/events",
    label: "Events",
    hint: "Calendar of seasons and scrims.",
  },
  {
    to: "/members",
    label: "Members",
    hint: "Public directory of Discord names, Epic names, and tiers.",
  },
  {
    to: "/tier-restrictions",
    label: "Tier Restrictions",
    hint: "Legal S / A / B / C team combinations.",
  },
] as const;

export default function LandingPage() {
  return (
    <PageShell className="justify-center pb-16 md:pb-24">
      <section className="overflow-hidden rounded-3xl border bg-card">
        <div className="p-6 sm:p-8">
          <div className="max-w-3xl space-y-3">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Co-Ed Zero Build Division
            </h1>
            <p className="max-w-2xl text-base sm:text-lg">
              Co-Ed ZBD Hub, the home of everything ZBD
            </p>
          </div>
        </div>

        <ul className="grid gap-px bg-border sm:grid-cols-3">
          {HOME_LINKS.map((item) => (
            <li key={item.to} className="bg-card">
              <Link
                to={item.to}
                className="flex items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-6 sm:py-5"
              >
                <span className="min-w-0 space-y-1">
                  <span className="block font-semibold">{item.label}</span>
                  <span className="block text-sm text-muted-foreground">{item.hint}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
