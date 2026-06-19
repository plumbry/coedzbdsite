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
  ssCardPad,
  ssGridGap,
  ssMutedSurface,
  ssPageBg,
  ssSectionTitle,
  ssSkeleton,
  ssStack,
} from "./_components/passport-dashboard-theme.ts";
import { PassportPreviewMini } from "./_components/passport-preview-mini.tsx";
import { CAMPAIGN_SLUG } from "./_components/passport-types.ts";
import { Compass, Sparkles, Stamp, Sun, Trophy } from "lucide-react";

const STEPS = [
  { icon: Compass, title: "Chart your route", body: "Five destinations, five seals." },
  { icon: Stamp, title: "Submit evidence", body: "Staff review manual quests." },
  { icon: Sun, title: "Collect seals", body: "Finish every challenge in a category." },
  { icon: Trophy, title: "Earn rewards", body: "Prize wheel entries & recognition." },
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
      <div className={cn(ssStack, "pb-6 pt-1")}>
        <div className={cn("grid lg:grid-cols-[1fr_260px]", ssGridGap, "lg:items-start")}>
          <div className={ssStack}>
            <header className={cn("overflow-hidden", ssCard)}>
              <div className={ssAccentBarClass} aria-hidden />
              <div className={ssCardPad}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider",
                      badge.className,
                    )}
                  >
                    {badge.label}
                  </span>
                  {campaign === undefined ? (
                    <Skeleton className={cn("h-3 w-32", ssSkeleton)} />
                  ) : (
                    <span className="text-[11px] text-orange-800/50">
                      {formatCampaignDateRange(campaign)}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                    <Sparkles className="h-3 w-3" aria-hidden />
                    Summer Slam
                  </span>
                </div>
                <h1 className="sr-only">
                  {campaign?.title ?? "Summer Slam Passport"}
                </h1>
                <img
                  src="/summer-slam/passport-header.png"
                  alt={campaign?.title ?? "Summer Slam Passport"}
                  width={747}
                  height={329}
                  className="mt-2 h-20 w-auto sm:h-24"
                />
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-orange-900/60 sm:text-sm">
                  {campaign?.description ??
                    "Collect seals across five destinations and earn prize wheel entries."}
                </p>
                {statusMessage ? (
                  <p className="mt-2 rounded-lg border border-orange-200/60 bg-orange-50/50 px-2.5 py-1.5 text-xs text-orange-900/70">
                    {statusMessage}
                  </p>
                ) : null}
              </div>
            </header>

            <div className={cn("grid sm:grid-cols-2", ssGridGap)}>
              <section className={cn(ssCard, ssCardPad)}>
                <h2 className={ssSectionTitle}>How it works</h2>
                <ol className="mt-2 space-y-2">
                  {STEPS.map((step, index) => (
                    <li key={step.title} className="flex gap-2">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-orange-700",
                          ssMutedSurface,
                        )}
                      >
                        <step.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-orange-950">
                          {index + 1}. {step.title}
                        </p>
                        <p className="text-[11px] text-orange-900/55">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section className={cn(ssCard, ssCardPad)}>
                <h2 className={ssSectionTitle}>Prize wheels</h2>
                <ul className="mt-2 space-y-1 text-xs text-orange-900/70">
                  <li>
                    <span className="font-semibold text-orange-950">{littleEvery} stamp{littleEvery === 1 ? "" : "s"}</span> = 1 Little entry
                  </li>
                  <li>
                    Every <span className="font-semibold text-orange-950">{bigEvery} stamps</span> = 1 Big entry
                  </li>
                  <li className="text-orange-800/45">One win per wheel per player.</li>
                </ul>
              </section>
            </div>

            <div className="lg:hidden">
              <PassportPreviewMini />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {!isLoaded || campaign === undefined ? (
                <Skeleton className={cn("h-10 w-full sm:w-48", ssSkeleton)} />
              ) : canEnterPassport ? (
                isSignedIn ? (
                  <Button asChild className="min-h-10 touch-manipulation">
                    <Link to="/summer-slam/passport">My Passport</Link>
                  </Button>
                ) : (
                  <SignInButton
                    className="min-h-10 touch-manipulation"
                    signInText="Sign in with Discord"
                    showIcon={false}
                  />
                )
              ) : (
                <Button disabled className="min-h-10">
                  Passport unavailable
                </Button>
              )}
              <Button asChild variant="outline" className="min-h-10 touch-manipulation">
                <Link to="/summer-slam/passport/demo">Demo passport</Link>
              </Button>
              <Button asChild variant="ghost" className="min-h-10 touch-manipulation">
                <Link to="/support">Rules & help</Link>
              </Button>
            </div>
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-4">
            <PassportPreviewMini />
            <p className="mt-1.5 text-center text-[10px] text-orange-800/45">
              Live passport tracks real progress
            </p>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
