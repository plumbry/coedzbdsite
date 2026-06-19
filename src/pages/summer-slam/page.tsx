import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/react";
import { api } from "@/convex/_generated/api.js";
import PageShell from "@/components/page-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import {
  formatCampaignDateRange,
  getCampaignPhase,
  phaseBadge,
  phaseMessage,
} from "./_components/campaign-phase.ts";
import { PassportPreviewMini } from "./_components/passport-preview-mini.tsx";
import { CAMPAIGN_SLUG } from "./_components/passport-types.ts";
import { BookOpen, CheckCircle2, Stamp, Ticket, Trophy } from "lucide-react";

const STEPS = [
  {
    icon: CheckCircle2,
    title: "Complete quests",
    body: "Play tagged Summer Slam events or finish tracked goals.",
  },
  {
    icon: Stamp,
    title: "Submit evidence",
    body: "Manual quests need a link or screenshot — staff review and approve.",
  },
  {
    icon: Ticket,
    title: "Collect stamps",
    body: "Each approved quest adds a passport stamp and prize wheel progress.",
  },
  {
    icon: Trophy,
    title: "Earn entries",
    body: "Stamps convert into Little and Big Prize Wheel entries.",
  },
];

export default function SummerSlamLandingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const campaign = useQuery(api.seasonal.getCampaign, { slug: CAMPAIGN_SLUG });

  const phase = getCampaignPhase(campaign ?? null);
  const badge = phaseBadge(phase);
  const statusMessage = phaseMessage(phase);
  const canEnterPassport = phase === "active";
  const littleEvery = campaign?.littleWheelEntryEveryStamps ?? 1;
  const bigEvery = campaign?.bigWheelEntryEveryStamps ?? 5;

  return (
    <PageShell maxWidth="wide" className="bg-[#F7F8FA]">
      <div className="pb-10 pt-2">
        <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="space-y-6">
            <header className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
                {campaign === undefined ? (
                  <Skeleton className="h-4 w-40" />
                ) : (
                  <span className="text-xs text-slate-500">
                    {formatCampaignDateRange(campaign)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                <BookOpen className="h-3.5 w-3.5" />
                Summer Slam
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {campaign?.title ?? "Summer Slam Passport"}
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                {campaign?.description ??
                  "Collect passport stamps, complete seasonal quests, and earn prize wheel entries."}
              </p>
              {statusMessage ? (
                <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  {statusMessage}
                </p>
              ) : null}
            </header>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-lg font-bold text-slate-900">How it works</h2>
              <ol className="mt-4 space-y-4">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F7F8FA]">
                      <step.icon className="h-5 w-5 text-slate-700" />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm font-semibold text-slate-900">
                        {index + 1}. {step.title}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-lg font-bold text-slate-900">Prize wheel entries</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>
                  <span className="font-semibold text-slate-900">
                    {littleEvery} approved stamp{littleEvery === 1 ? "" : "s"}
                  </span>{" "}
                  = 1 Little Wheel entry
                </li>
                <li>
                  Every{" "}
                  <span className="font-semibold text-slate-900">
                    {bigEvery} approved stamps
                  </span>{" "}
                  = 1 Big Wheel entry
                </li>
                <li className="text-slate-600">Each player can only win once per wheel.</li>
              </ul>
            </section>

            <div className="lg:hidden">
              <PassportPreviewMini />
              <p className="mt-2 text-center text-xs text-slate-500">
                Sample passport layout — your stamps reflect live progress.
              </p>
            </div>

            <div className="space-y-3">
              {!isLoaded || campaign === undefined ? (
                <Skeleton className="h-12 w-full rounded-xl" />
              ) : canEnterPassport ? (
                isSignedIn ? (
                  <Button asChild size="lg" className="min-h-12 w-full touch-manipulation sm:w-auto">
                    <Link to="/summer-slam/passport">Continue to My Passport</Link>
                  </Button>
                ) : (
                  <SignInButton
                    size="lg"
                    className="min-h-12 w-full touch-manipulation sm:w-auto"
                    signInText="Sign in with Discord to Start"
                    showIcon={false}
                  />
                )
              ) : (
                <Button size="lg" disabled className="min-h-12 w-full sm:w-auto">
                  Passport not available yet
                </Button>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  asChild
                  variant="outline"
                  className="min-h-11 touch-manipulation"
                >
                  <Link to="/summer-slam/passport/demo">View demo passport</Link>
                </Button>
                <Button asChild variant="ghost" className="min-h-11 touch-manipulation">
                  <Link to="/support">Rules & help</Link>
                </Button>
              </div>
            </div>
          </div>

          <aside className="hidden lg:sticky lg:top-6 lg:block">
            <PassportPreviewMini />
            <p className="mt-3 text-center text-xs text-slate-500">
              Sample passport layout — your stamps will reflect live quest progress.
            </p>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
