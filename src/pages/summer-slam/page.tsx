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
import {
  ssAccentBarClass,
  ssCard,
  ssMutedSurface,
  ssPageBg,
  ssSectionDesc,
  ssSectionTitle,
  ssSkeleton,
} from "./_components/passport-dashboard-theme.ts";
import { PassportPreviewMini } from "./_components/passport-preview-mini.tsx";
import { CAMPAIGN_SLUG } from "./_components/passport-types.ts";
import { CheckCircle2, Sparkles, Stamp, Ticket, Trophy } from "lucide-react";

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
    title: "Collect seals",
    body: "Finish every challenge in a category to earn its official seal.",
  },
  {
    icon: Trophy,
    title: "Earn entries",
    body: "Approved stamps convert into Little and Big Prize Wheel entries.",
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
    <PageShell maxWidth="wide" className={ssPageBg}>
      <div className="pb-10 pt-2">
        <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="space-y-6">
            <header className={cn("relative overflow-hidden", ssCard)}>
              <div className={ssAccentBarClass} aria-hidden />
              <div className="space-y-3 px-6 py-6 sm:px-8 sm:py-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                      badge.className,
                    )}
                  >
                    {badge.label}
                  </span>
                  {campaign === undefined ? (
                    <Skeleton className={cn("h-4 w-40", ssSkeleton)} />
                  ) : (
                    <span className="text-xs text-stone-500">
                      {formatCampaignDateRange(campaign)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-teal-700">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Seasonal event
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
                  {campaign?.title ?? "Summer Slam Passport"}
                </h1>
                <p className="max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base">
                  {campaign?.description ??
                    "Complete seasonal challenges, collect official category seals, and earn prize wheel entries."}
                </p>
                {statusMessage ? (
                  <p className="rounded-xl border border-stone-200/80 bg-stone-50/80 px-4 py-3 text-sm text-stone-700">
                    {statusMessage}
                  </p>
                ) : null}
              </div>
            </header>

            <section className={cn(ssCard, "p-5 sm:p-6")}>
              <h2 className={ssSectionTitle}>How it works</h2>
              <p className={ssSectionDesc}>Four steps from quest to prize wheel entry.</p>
              <ol className="mt-5 space-y-4">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-700",
                        ssMutedSurface,
                      )}
                    >
                      <step.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm font-semibold text-stone-900">
                        {index + 1}. {step.title}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed text-stone-600">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className={cn(ssCard, "p-5 sm:p-6")}>
              <h2 className={ssSectionTitle}>Prize wheel entries</h2>
              <p className={ssSectionDesc}>Stamps from approved quests unlock wheel entries.</p>
              <ul className="mt-4 space-y-2 text-sm text-stone-700">
                <li>
                  <span className="font-semibold text-stone-900">
                    {littleEvery} approved stamp{littleEvery === 1 ? "" : "s"}
                  </span>{" "}
                  = 1 Little Wheel entry
                </li>
                <li>
                  Every{" "}
                  <span className="font-semibold text-stone-900">
                    {bigEvery} approved stamps
                  </span>{" "}
                  = 1 Big Wheel entry
                </li>
                <li className="text-stone-500">Each player can only win once per wheel.</li>
              </ul>
            </section>

            <div className="lg:hidden">
              <PassportPreviewMini />
              <p className="mt-2 text-center text-xs text-stone-500">
                Sample layout — your passport reflects live progress.
              </p>
            </div>

            <div className="space-y-3">
              {!isLoaded || campaign === undefined ? (
                <Skeleton className={cn("h-12 w-full", ssSkeleton)} />
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
                <Button asChild variant="outline" className="min-h-11 touch-manipulation">
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
            <p className="mt-3 text-center text-xs text-stone-500">
              Sample layout — your passport reflects live quest progress.
            </p>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
