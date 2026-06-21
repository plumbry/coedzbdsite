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
  getCampaignPhase,
  phaseMessage,
} from "./_components/campaign-phase.ts";
import {
  ssCard,
  ssCardPad,
  ssMutedSurface,
  ssPageBg,
  ssPageContainer,
  ssPageContent,
  ssPassportGrid,
  ssPassportMainColumn,
  ssPassportSidebar,
  ssPassportStretchPanel,
  ssSectionTitle,
  ssSkeleton,
} from "./_components/passport-dashboard-theme.ts";
import { PassportPreviewMini } from "./_components/passport-preview-mini.tsx";
import { PassportHero } from "./_components/passport-hero.tsx";
import { SEASON_REWARDS } from "./_components/passport-destinations.ts";
import { CAMPAIGN_SLUG, getPassportErrorTitle, mapEnsurePassportError } from "./_components/passport-types.ts";
import { Compass, Gift, Stamp, Sun, Trophy, Upload, UserCheck } from "lucide-react";

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
  "flex flex-1 items-center justify-center rounded-md border border-transparent px-3 py-2 text-center text-sm font-semibold sm:text-base " +
  "transition-[color,background-color,box-shadow] " +
  "data-[state=inactive]:bg-transparent data-[state=inactive]:text-orange-800/55 " +
  "data-[state=inactive]:hover:bg-orange-100/80 data-[state=inactive]:hover:text-orange-950 " +
  "data-[state=active]:!border-teal-700/30 data-[state=active]:!bg-teal-600 data-[state=active]:!text-white " +
  "data-[state=active]:shadow-sm data-[state=active]:hover:!bg-teal-700 " +
  "focus-visible:ring-teal-400/50";

const GUIDE_TAB_PANEL_CLASS =
  "col-start-1 row-start-1 mt-0 text-center data-[state=inactive]:pointer-events-none data-[state=inactive]:invisible";
const GUIDE_STEP_TITLE_CLASS = "text-sm font-semibold text-orange-950";
const GUIDE_STEP_BODY_CLASS = "text-[13px] text-orange-900/55";

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
  const statusMessage = phaseMessage(phase);
  const canEnterPassport = phase === "active";
  const hasPassport = Boolean(passportStatus?.passport);
  const isPassportStatusLoading =
    isSignedIn && (!isConvexAuthenticated || passportStatus === undefined);
  const littleEvery = campaign?.littleWheelEntryEveryStamps ?? 1;
  const bigEvery = campaign?.bigWheelEntryEveryStamps ?? 5;
  const prizeItems = getPrizeItems(littleEvery, bigEvery);
  const campaignDescription =
    campaign?.description ??
    "Complete quests during scrims, submit evidence, earn a place on the prize wheel!";

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
      <div className={ssPageContent}>
        <div className={ssPageContainer}>
          <PassportHero title={campaign?.title ?? "Summer Slam Passport"} />

          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
              {!isLoaded || campaign === undefined || isPassportStatusLoading ? (
                <Skeleton className={cn("h-10 w-48 max-w-full", ssSkeleton)} />
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

            <div className={ssPassportGrid}>
            <div className={ssPassportMainColumn}>
              <section
                className={cn(ssCard, ssCardPad, ssPassportStretchPanel)}
                aria-label="Summer Slam guide"
              >
                <Tabs defaultValue="how-it-works" className="flex min-h-0 flex-1 flex-col gap-3">
                  {campaign === undefined ? (
                    <Skeleton className={cn("mx-auto h-4 w-full max-w-md", ssSkeleton)} />
                  ) : (
                    <div className="space-y-2 text-center">
                      <p className="text-sm leading-relaxed text-orange-900/60 sm:text-base">
                        {campaignDescription}
                      </p>
                      {statusMessage ? (
                        <p className="rounded-lg border border-orange-200/60 bg-orange-50/50 px-2.5 py-1.5 text-sm text-orange-900/70">
                          {statusMessage}
                        </p>
                      ) : null}
                    </div>
                  )}
                  <TabsList className="h-auto w-full justify-stretch rounded-lg border border-orange-200/60 bg-orange-50/50 p-1 text-orange-900">
                    <TabsTrigger value="how-it-works" className={TAB_TRIGGER_CLASS}>
                      How It Works
                    </TabsTrigger>
                    <TabsTrigger value="prizes" className={TAB_TRIGGER_CLASS}>
                      Prizes
                    </TabsTrigger>
                  </TabsList>

                  <div className="grid min-h-0 flex-1">
                    <TabsContent forceMount value="how-it-works" className={GUIDE_TAB_PANEL_CLASS}>
                      <ol className="space-y-3">
                        {STEPS.map((step, index) => (
                          <li key={step.title} className="flex flex-col items-center gap-1.5">
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-orange-700",
                                ssMutedSurface,
                              )}
                            >
                              <step.icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 max-w-md">
                              <p className={GUIDE_STEP_TITLE_CLASS}>
                                {index + 1}. {step.title}
                              </p>
                              <p className={GUIDE_STEP_BODY_CLASS}>{step.body}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </TabsContent>

                    <TabsContent forceMount value="prizes" className={GUIDE_TAB_PANEL_CLASS}>
                      <p className={cn("mx-auto max-w-md leading-relaxed", GUIDE_STEP_BODY_CLASS)}>
                        Complete quests to earn wheel tickets for prize draws, and finish every stamp
                        category for the full passport reward.
                      </p>
                      <ul className="mt-3 space-y-3">
                        {prizeItems.map((prize) => (
                          <li key={prize.title} className="flex flex-col items-center gap-1.5">
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-orange-700",
                                ssMutedSurface,
                              )}
                            >
                              <prize.icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 max-w-md">
                              <p className={GUIDE_STEP_TITLE_CLASS}>{prize.title}</p>
                              <p className={GUIDE_STEP_BODY_CLASS}>{prize.body}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <p className={cn("mx-auto mt-3 max-w-md text-orange-800/45", GUIDE_STEP_BODY_CLASS)}>
                        Draw dates and prize details are announced in Discord. Ticket totals are tracked
                        on your passport.
                      </p>
                    </TabsContent>
                  </div>
                </Tabs>
              </section>
            </div>

            <aside className={ssPassportSidebar}>
              <PassportPreviewMini className="shrink-0" />
              <p className="shrink-0 text-center text-[10px] text-orange-800/45 lg:text-left">
                Your passport updates as you complete quests
              </p>

              <section className={cn(ssCard, ssCardPad, ssPassportStretchPanel)}>
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
                    Most quests award 1 wheel point when approved.
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
