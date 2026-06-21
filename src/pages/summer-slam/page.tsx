import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import { useAuth } from "@clerk/react";
import { api } from "@/convex/_generated/api.js";
import PageShell from "@/components/page-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
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
  ssDisplayTitle,
  ssMutedSurface,
  ssPageBg,
  ssSectionTitle,
  ssSkeleton,
  ssStack,
} from "./_components/passport-dashboard-theme.ts";
import { PassportPreviewMini } from "./_components/passport-preview-mini.tsx";
import { SEASON_REWARDS } from "./_components/passport-destinations.ts";
import { PASSPORT_HEADER } from "./_components/passport-assets.ts";
import { CAMPAIGN_SLUG, getPassportErrorTitle, mapEnsurePassportError } from "./_components/passport-types.ts";
import { Compass, Gift, Sparkles, Stamp, Sun, Trophy, Upload, UserCheck } from "lucide-react";

const STEPS = [
  {
    icon: Compass,
    title: "Open your passport",
    body: "Five destination categories, each with quests. Track progress on your passport dashboard.",
  },
  {
    icon: Sun,
    title: "Complete quests",
    body: "Auto quests track from tagged ZBD events. Manual quests need proof. Staff-awarded quests are granted by admins.",
  },
  {
    icon: Upload,
    title: "Submit evidence",
    body: "For manual quests, upload an image or paste a clip link. Only submit when you meet the quest requirements.",
  },
  {
    icon: UserCheck,
    title: "Staff review",
    body: "Admins check evidence against quest instructions. Typical review time is 48–72 hours. Resubmit if staff request more proof.",
  },
  {
    icon: Stamp,
    title: "Earn seals",
    body: "When every quest in a destination category is approved, you earn that category seal on your passport.",
  },
  {
    icon: Trophy,
    title: "Wheel tickets",
    body: "Approved quests award wheel points. Points convert to Little and Big Wheel tickets at configured thresholds.",
  },
];

const TAB_TRIGGER_CLASS =
  "flex-1 rounded-md border border-transparent px-3 py-2 text-xs font-semibold sm:text-sm " +
  "transition-[color,background-color,box-shadow] " +
  "data-[state=inactive]:bg-transparent data-[state=inactive]:text-orange-800/55 " +
  "data-[state=inactive]:hover:bg-orange-100/80 data-[state=inactive]:hover:text-orange-950 " +
  "data-[state=active]:!border-teal-700/30 data-[state=active]:!bg-teal-600 data-[state=active]:!text-white " +
  "data-[state=active]:shadow-sm data-[state=active]:hover:!bg-teal-700 " +
  "focus-visible:ring-teal-400/50";

function getPrizeItems(littleEvery: number, bigEvery: number) {
  const fullPassport = SEASON_REWARDS.find((reward) => reward.id === "passport");

  return [
    {
      icon: Gift,
      title: "Little Wheel tickets",
      body:
        littleEvery === 1
          ? "Each approved quest earns 1 wheel point and a Little Wheel ticket — your entry into regular season prize draws."
          : `Every ${littleEvery} wheel points earns a Little Wheel ticket — your entry into regular season prize draws.`,
    },
    {
      icon: Trophy,
      title: "Big Wheel tickets",
      body: `Every ${bigEvery} wheel points earns a Big Wheel ticket — your entry into the headline end-of-season prize draw.`,
    },
    {
      icon: Stamp,
      title: fullPassport?.title ?? "Full Passport",
      body:
        fullPassport?.description ??
        "Collect all five stamps to complete your passport and receive a certificate and exclusive Discord role.",
    },
  ] as const;
}

export default function SummerSlamLandingPage() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const [isClaimingPassport, setIsClaimingPassport] = useState(false);
  const campaign = useQuery(api.seasonal.getCampaign, { slug: CAMPAIGN_SLUG });
  const passportStatus = useQuery(
    api.seasonal.getPassport,
    isSignedIn && isConvexAuthenticated ? { slug: CAMPAIGN_SLUG } : "skip",
  );
  const ensureMyPassport = useMutation(api.seasonal.ensureMyPassport);

  const phase = getCampaignPhase(campaign ?? null);
  const badge = phaseBadge(phase);
  const statusMessage = phaseMessage(phase);
  const canEnterPassport = phase === "active";
  const hasPassport = Boolean(passportStatus?.passport);
  const isPassportStatusLoading =
    isSignedIn && (!isConvexAuthenticated || passportStatus === undefined);
  const littleEvery = campaign?.littleWheelEntryEveryStamps ?? 1;
  const bigEvery = campaign?.bigWheelEntryEveryStamps ?? 5;
  const campaignDateRange =
    campaign !== undefined ? formatCampaignDateRange(campaign) : undefined;
  const prizeItems = getPrizeItems(littleEvery, bigEvery);

  const handleClaimPassport = async () => {
    setIsClaimingPassport(true);
    try {
      await ensureMyPassport({ slug: CAMPAIGN_SLUG });
      navigate("/summer-slam/passport");
    } catch (error) {
      const message = String(
        (error as { data?: { message?: string }; message?: string })?.data?.message ||
          (error as Error)?.message ||
          "",
      );
      toast.error(getPassportErrorTitle(message), {
        description: mapEnsurePassportError(message),
      });
    } finally {
      setIsClaimingPassport(false);
    }
  };

  return (
    <PageShell maxWidth="wide" className={ssPageBg}>
      <div className={cn(ssStack, "pb-8 pt-1")}>
        <div className="mx-auto w-full max-w-6xl px-3 sm:px-4">
          <header className="mb-4 overflow-hidden pb-1">
            <div className="flex flex-col items-center px-1 pt-1 lg:items-start">
              <h1 className="sr-only">{campaign?.title ?? "Summer Slam Passport"}</h1>
              <img
                src={PASSPORT_HEADER.src}
                alt={campaign?.title ?? "Summer Slam Passport"}
                width={PASSPORT_HEADER.width}
                height={PASSPORT_HEADER.height}
                className="h-auto w-full max-w-[min(100%,944px)] lg:max-w-none"
              />
            </div>
          </header>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {!isLoaded || campaign === undefined || isPassportStatusLoading ? (
                <Skeleton className={cn("h-10 w-full sm:w-48", ssSkeleton)} />
              ) : canEnterPassport ? (
                isSignedIn ? (
                  hasPassport ? (
                    <Button asChild className="min-h-10 touch-manipulation">
                      <Link to="/summer-slam/passport">My Passport</Link>
                    </Button>
                  ) : (
                    <Button
                      className="min-h-10 touch-manipulation"
                      disabled={isClaimingPassport}
                      onClick={() => void handleClaimPassport()}
                    >
                      {isClaimingPassport ? "Claiming…" : "Claim Passport"}
                    </Button>
                  )
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
              <Button asChild variant="ghost" className="min-h-10 touch-manipulation">
                <Link to="/support">Site Support</Link>
              </Button>
            </div>

            <div className="flex flex-col gap-6 lg:grid lg:items-stretch lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)] lg:gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className={cn(ssStack, "min-w-0")}>
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
                    ) : campaignDateRange ? (
                      <span className="text-[11px] text-orange-800/50">{campaignDateRange}</span>
                    ) : null}
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                      <Sparkles className="h-3 w-3" aria-hidden />
                      Summer Slam
                    </span>
                  </div>
                  <h2 className={cn(ssDisplayTitle, "mt-1.5 text-xl sm:text-2xl")}>
                    {campaign?.title ?? "Summer Slam Passport"}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-orange-900/60 sm:text-sm">
                    {campaign?.description ??
                      "Complete quests during scrims, submit evidence, earn a place on the prize wheel!"}
                  </p>
                  {statusMessage ? (
                    <p className="mt-2 rounded-lg border border-orange-200/60 bg-orange-50/50 px-2.5 py-1.5 text-xs text-orange-900/70">
                      {statusMessage}
                    </p>
                  ) : null}
                </div>
              </header>

              <section className={cn(ssCard, ssCardPad)} aria-label="Summer Slam guide">
                <Tabs defaultValue="how-it-works" className="gap-3">
                  <TabsList className="h-auto w-full justify-stretch rounded-lg border border-orange-200/60 bg-orange-50/50 p-1 text-orange-900">
                    <TabsTrigger value="how-it-works" className={TAB_TRIGGER_CLASS}>
                      How It Works
                    </TabsTrigger>
                    <TabsTrigger value="prizes" className={TAB_TRIGGER_CLASS}>
                      Prizes
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="how-it-works" className="mt-0">
                    <ol className="space-y-2">
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
                  </TabsContent>

                  <TabsContent value="prizes" className="mt-0">
                    <p className="text-xs leading-relaxed text-orange-900/60">
                      Complete quests to earn wheel tickets for prize draws, and finish every stamp
                      category for the full passport reward.
                    </p>
                    <ul className="mt-3 space-y-2">
                      {prizeItems.map((prize) => (
                        <li key={prize.title} className="flex gap-2">
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-orange-700",
                              ssMutedSurface,
                            )}
                          >
                            <prize.icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-orange-950">{prize.title}</p>
                            <p className="text-[11px] text-orange-900/55">{prize.body}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[11px] text-orange-800/45">
                      Draw dates and prize details are announced in Discord. Ticket totals are tracked
                      on your passport.
                    </p>
                  </TabsContent>
                </Tabs>
              </section>
            </div>

            <aside className={cn(ssStack, "min-w-0 gap-4")}>
              <PassportPreviewMini />
              <p className="text-center text-[10px] text-orange-800/45 lg:text-left">
                Your passport updates as you complete quests
              </p>

              <section className={cn(ssCard, ssCardPad)}>
                <h2 className={ssSectionTitle}>Ticket totals</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-orange-900/55">
                  How approved quests convert to wheel entries:
                </p>
                <ul className="mt-2 space-y-1 text-xs text-orange-900/70">
                  <li>
                    <span className="font-semibold text-orange-950">
                      {littleEvery === 1 ? "Every wheel point" : `Every ${littleEvery} wheel points`}
                    </span>{" "}
                    = 1 Little Wheel ticket
                  </li>
                  <li>
                    Every{" "}
                    <span className="font-semibold text-orange-950">{bigEvery} wheel points</span> = 1
                    Big Wheel ticket
                  </li>
                  <li className="text-orange-800/45">
                    Most quests award 1 wheel point when approved. Tickets are exported for prize draws.
                  </li>
                </ul>
              </section>
            </aside>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
